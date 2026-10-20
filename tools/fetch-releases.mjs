/**
 * 抓取每个项目的最新 Release 及其安装包，写回 projects.json。
 *
 * 用法：
 *   node tools/fetch-releases.mjs
 *   node tools/fetch-releases.mjs --dry-run     # 抓完只打印，不写盘
 *   node tools/fetch-releases.mjs --only owner/repo owner/repo
 *
 * token 来源（按优先级）：
 *   GITHUB_TOKEN 环境变量 → GH_TOKEN 环境变量 → 本地 git 凭据（git credential fill）
 * 没有 token 也能跑，只是匿名配额只有 60 次/小时，1699 个项目必然中途耗尽。
 *
 * 写入结构：
 *   release.tag        版本号，如 v1.2.3
 *   release.name       Release 标题
 *   release.published  发布时间
 *   release.url        Release 页面地址
 *   release.assets[]   每个安装包：name / size / url / downloads
 *
 * 跑完之后建议接着执行：
 *   node tools/pick-installers.mjs   # 生成 best_assets（卡片「下载应用」读的是这个）
 *   node tools/slim-data.mjs         # 丢掉 release.assets，projects.json 才会上线
 *
 * 为什么用 GraphQL 批量：
 *   GITHUB_TOKEN 在 Actions 里的 REST 额度是 1000 次/小时/仓库，
 *   逐仓库请求 /repos/{repo}/releases/latest，项目数过千之后后半段必然
 *   403（失败时旧值会被保留，所以不会损坏数据，但也不会更新）。
 *   GraphQL 一条查询用别名取 40 个仓库的 latestRelease，1699 个项目只要
 *   43 次请求（实测 cost=1 点/次）。批量取 40 而不是 100：每个仓库要展开
 *   releases + assets 两层，别名字段更多，40 个就开始踩 "Resource limits
 *   for this query exceeded"，100 个必挂。
 *   仓库改名 / 已删除 / 整批失败的会回落到 REST 逐个抓，行为与旧版一致。
 *
 * 数据完整性约定：
 *   · 只有真的抓到了才改动 project.release，失败和未取到的保留原值，
 *     绝不因为一次 403 就把已有的安装包信息删掉
 *   · 失败率超过 2% 时退出码为 1，让 Actions 变红而不是静默降级
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "projects.json");
const projects = JSON.parse(await readFile(dataPath, "utf8"));

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_ARG = process.argv.findIndex((a) => a === "--only");
const ONLY = ONLY_ARG > -1 ? new Set(process.argv.slice(ONLY_ARG + 1)) : null;

/** GraphQL 每批仓库数：release/assets 字段比纯 star 多，40 个就开始踩资源限制 */
const GQL_BATCH = 40;
/** 单批重试次数（GitHub 偶发 502） */
const GQL_ATTEMPTS = 4;
/** 无 token 时 REST 的间隔；批量失败时回落逐个抓也用这个 */
const REST_GAP_MS = 150;
/** 失败率超过这个比例就让 workflow 变红 */
const FAIL_RATIO_LIMIT = 0.02;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ token 获取 ------------------------------ */

function tokenFromGitCredential() {
    try {
        const out = execFileSync("git", ["credential", "fill"], {
            input: "protocol=https\nhost=github.com\n\n",
            encoding: "utf8",
            timeout: 8000
        });
        const match = /^password=(.+)$/m.exec(out);
        return match ? match[1].trim() : "";
    } catch {
        return "";
    }
}

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || tokenFromGitCredential();
const useApi = !!TOKEN;

const HEADERS = {
    "User-Agent": "opensource-market-refresh",
    Accept: "application/vnd.github+json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
};

/* --------------------------- 抓取：GraphQL 批量 --------------------------- */

const GQL_FIELDS = `latestRelease {
        tagName
        name
        publishedAt
        url
        releaseAssets(first: 40) {
            nodes { name size downloadUrl downloadCount }
        }
    }`;

/** 把 repo 列表编成一条带别名的 GraphQL 查询（r0..rN） */
function buildGraphQLQuery(repos) {
    const aliases = repos.map((repo, index) => {
        const [owner, name] = repo.split("/");
        return `  r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${GQL_FIELDS} }`;
    });
    return `query {\n  rateLimit { limit remaining resetAt cost }\n${aliases.join("\n")}\n}`;
}

/**
 * 把 GraphQL 的 Release 节点映射成与 REST 一致的字段形态。
 *
 * 顺序处理：GitHub 的 releaseAssets 连接既不接受 orderBy 参数，资产对象上
 * 也没有 createdAt 字段，只能拿到底层顺序。实测 REST 的 /releases/latest
 * 返回顺序本身在同一次会话的多次请求之间都会变化，所以「和 REST 逐项
 * 一致」这个目标不成立。这里改成按名称字典序做稳定排序：每次运行输入相同，
 * 输出就相同。下游 pick-installers 的排序是 (rank, size) 全键比较，只有
 * size 也相同时才落到输入顺序，影响仅限于同名体积的罕见情况。
 */
function mapGraphQLRelease(node) {
    const nodes = [...(node.latestRelease.releaseAssets.nodes || [])].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    );

    return {
        data: {
            tag: node.latestRelease.tagName,
            name: node.latestRelease.name || node.latestRelease.tagName,
            published: node.latestRelease.publishedAt,
            url: node.latestRelease.url,
            assets: nodes.map((a) => ({
                name: a.name,
                size: a.size,
                url: a.downloadUrl,
                downloads: a.downloadCount
            }))
        }
    };
}

/**
 * 批量抓一批仓库的 latestRelease。
 * 返回 { results: Map<repo, {data} | {needsRest:true}>, error? }
 *   · latestRelease 为 null → 策略和旧版「404 / 无附件」一致：删除 release 字段
 *   · 仓库改名 / 被删 / 别名字段缺失 → needsRest，回落到 REST
 *   · 整批失败时 results 为 null，调用方把这批全部回落到 REST
 */
async function fetchBatchViaGraphQL(repos) {
    const query = buildGraphQLQuery(repos);
    let lastError = "";

    for (let attempt = 1; attempt <= GQL_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch("https://api.github.com/graphql", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    "Content-Type": "application/json",
                    "User-Agent": "opensource-market-refresh"
                },
                body: JSON.stringify({ query })
            });
            const text = await response.text();
            let payload;
            try {
                payload = JSON.parse(text);
            } catch {
                throw new Error(`HTTP ${response.status} 返回非 JSON（多为 502 网关错误）`);
            }

            if (!response.ok) {
                lastError = `HTTP ${response.status}`;
            } else if (!payload.data) {
                lastError =
                    (payload.errors || [])
                        .map((e) => e.message)
                        .join("; ")
                        .slice(0, 140) || "响应里没有 data";
            } else {
                const results = new Map();
                repos.forEach((repo, index) => {
                    const node = payload.data[`r${index}`];
                    if (!node) {
                        results.set(repo, { needsRest: true });
                    } else if (!node.latestRelease) {
                        results.set(repo, { data: null });
                    } else {
                        results.set(repo, mapGraphQLRelease(node));
                    }
                });
                return { results };
            }
        } catch (error) {
            lastError = String(error.message || error).slice(0, 100);
        }
        if (attempt < GQL_ATTEMPTS) await sleep(1500 * attempt);
    }

    return { results: null, error: lastError };
}

/* ------------------------------ 抓取：REST ------------------------------ */

async function fetchViaApi(repo) {
    let response;
    try {
        response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
            headers: HEADERS
        });
    } catch (error) {
        return { error: String(error.message || error).slice(0, 60) };
    }

    if (response.status === 404) return { data: null };
    if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining === "0") return { rateLimited: true };
        return { error: `HTTP ${response.status}（非限流，可能是仓库访问受限）` };
    }
    if (!response.ok) return { error: `HTTP ${response.status}` };

    const release = await response.json();
    return {
        data: {
            tag: release.tag_name,
            name: release.name || release.tag_name,
            published: release.published_at,
            url: release.html_url,
            assets: (release.assets || []).map((a) => ({
                name: a.name,
                size: a.size,
                url: a.browser_download_url,
                downloads: a.download_count
            }))
        }
    };
}

/* ------------------------------ 主流程 ------------------------------ */

const targets = ONLY
    ? projects.filter((p) => ONLY.has(p.repo))
    : projects.filter((p) => p.repo);

console.log(
    `共 ${projects.length} 个项目，本次需抓取 ${targets.length} 个｜方式：` +
        (useApi ? `GraphQL 批量（每批 ${GQL_BATCH} 个）+ REST 回落` : "REST 逐个（无 token，匿名配额 60 次/小时）") +
        (DRY_RUN ? "｜dry-run，不写盘" : "")
);

let ok = 0;
let failed = 0;
let rateLimited = 0;
let gqlRequests = 0;
let restRequests = 0;
const refreshedRepos = new Set();
const failures = [];

/**
 * 把一次抓取结果写进项目对象。
 *
 * best_assets 一律不在这里动，交给 tools/pick-installers.mjs：
 *   本脚本写出的 release 只有在"真的抓到了资产"时才带 assets，而线上
 *   projects.json 是 slim 过的（release 只剩 tag/name/published/url）。
 *   在这里删除 best_assets 会把 806 个项目的安装包全部清空——线上数据
 *   根本没有 assets 可比。删不删、怎么挑，是 pick-installers 的职责。
 */
function applyResult(project, result) {
    const { data } = result;

    if (data === null) {
        // 404 / 无 Release：release 元信息也一并清掉
        delete project.release;
    } else if (data.assets && data.assets.length) {
        project.release = data;
    } else {
        // 有 Release 但没附件：只保留元信息
        const { tag, name, published, url } = data;
        project.release = { tag, name, published, url };
    }

    refreshedRepos.add(project.repo);
}

if (useApi) {
    /* ---- 第一轮：GraphQL 批量 ---- */
    const batches = [];
    for (let i = 0; i < targets.length; i += GQL_BATCH) {
        batches.push(targets.slice(i, i + GQL_BATCH));
    }

    const restQueue = [];

    for (let i = 0; i < batches.length; i += 1) {
        const batch = batches[i];
        gqlRequests += 1;
        const { results, error } = await fetchBatchViaGraphQL(batch.map((p) => p.repo));

        if (!results) {
            console.error(
                `[批次 ${i + 1}/${batches.length}] 整批失败（${error}），这 ${batch.length} 个转为 REST 逐个抓`
            );
            restQueue.push(...batch);
        } else {
            let noRelease = 0;
            let toRest = 0;
            for (const project of batch) {
                const hit = results.get(project.repo);
                if (hit && hit.needsRest) {
                    toRest += 1;
                    restQueue.push(project);
                } else {
                    // data 为 null 表示这个仓库没有 Release，也是有效结果
                    applyResult(project, hit);
                    ok += 1;
                    if (!hit.data) noRelease += 1;
                }
            }
            console.log(
                `[批次 ${i + 1}/${batches.length}] ${batch.length} 个 → 有安装包 ${batch.length - toRest - noRelease}，无 Release ${noRelease}，回落 REST ${toRest}`
            );
        }
    }

    /* ---- 第二轮：REST 回落（改名 / 已删除 / 批次失败） ---- */
    if (restQueue.length) {
        console.log(`\nREST 回落：${restQueue.length} 个（改名、已删除或批次失败）`);
        for (let i = 0; i < restQueue.length; i += 1) {
            if (rateLimited > 0 && restQueue.length - i > 20) {
                console.error(
                    `限流已触发，停止 REST 回落（还剩 ${restQueue.length - i} 个），留待下次运行`
                );
                break;
            }
            const project = restQueue[i];
            restRequests += 1;
            const result = await fetchViaApi(project.repo);
            if (result.rateLimited) {
                rateLimited += 1;
                failed += 1;
                failures.push(`${project.repo} → REST 限流（配额已用尽）`);
                console.error(`\n失败  ${project.repo} -> REST 限流`);
            } else if (result.error) {
                failed += 1;
                failures.push(`${project.repo} → ${result.error}`);
                console.error(`\n失败  ${project.repo} -> ${result.error}`);
            } else {
                applyResult(project, result);
                ok += 1;
            }
            if (i < restQueue.length - 1) await sleep(REST_GAP_MS);
        }
    }
} else {
    /* ---- 无 token：逐个抓，行为与旧版一致 ---- */
    for (const project of targets) {
        let result;
        try {
            result = await fetchViaApi(project.repo);
        } catch (error) {
            result = { error: String(error.message || error).slice(0, 60) };
        }

        if (result.rateLimited) {
            rateLimited += 1;
            failed += 1;
            failures.push(`${project.repo} → 限流（配额已用尽）`);
            console.error(`\n失败  ${project.repo} -> 限流`);
        } else if (result.error) {
            failed += 1;
            failures.push(`${project.repo} → ${result.error}`);
            console.error(`\n失败  ${project.repo} -> ${result.error}`);
        } else {
            applyResult(project, result);
            ok += 1;
        }

        await sleep(1000);
    }
}

/* ------------------------------ 写盘 ------------------------------ */

const withAssets = targets.filter((p) => refreshedRepos.has(p.repo) && p.release && p.release.assets && p.release.assets.length).length;
const noRelease = ok - withAssets;

if (DRY_RUN) {
    console.log(`\ndry-run：以上结果不会写入任何文件`);
} else {
    await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");
}

console.log(
    `\n完成：成功 ${ok} 个，失败 ${failed} 个，限流 ${rateLimited} 个` +
        `\n请求数：GraphQL ${gqlRequests} 次 + REST ${restRequests} 次 = ${gqlRequests + restRequests} 次` +
        `\n有安装包 ${withAssets} 个，无 Release/无附件 ${noRelease} 个` +
        (DRY_RUN ? "（dry-run 未写入）" : "")
);

if (failures.length) {
    console.log(`\n失败清单（最多列 10 个）：`);
    failures.slice(0, 10).forEach((item) => console.log(`  - ${item}`));
    if (failures.length > 10) console.log(`  ... 另有 ${failures.length - 10} 个`);
}

/* 退出码：限流或失败率过高时让 Actions 变红，避免静默降级 */
const failLimit = Math.max(5, Math.floor(targets.length * FAIL_RATIO_LIMIT));
if (rateLimited > 0) {
    console.log(`::error::抓取遇到 API 限流，本次数据不完整（成功 ${ok}，失败 ${failed}）`);
    process.exitCode = 1;
} else if (failed > failLimit) {
    console.log(`::error::失败 ${failed} 个，超过阈值 ${failLimit}（${FAIL_RATIO_LIMIT * 100}%），数据不完整`);
    process.exitCode = 1;
}
