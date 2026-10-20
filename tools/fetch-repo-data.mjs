/**
 * 抓取每个项目的 star 数、最近更新时间、默认分支，写回 projects.json。
 *
 * 两种抓取方式，自动选择：
 *   1) 有 token  → GraphQL 批量（100 个仓库一次请求）+ REST 逐个回落
 *   2) 没 token  → Playwright 打开仓库网页解析（不消耗 API 额度，但慢且易被连接重置）
 *
 * 为什么改成 GraphQL 批量：
 *   GITHUB_TOKEN 在 Actions 里是 1000 次/小时/仓库，逐仓库 REST 抓取在项目数
 *   超过 1000 之后必然中途 403。2026-10 项目数已到 1699，逐仓库要 1699 次请求，
 *   后 699 个拿不到更新，而且脚本不会报错——只是把旧 star 当成新快照写进
 *   stars-history，热门榜上这些项目的增量会静默变成 0。
 *   GraphQL 一次查询用别名取 100 个仓库，1699 个项目只要 17 次请求、17 个点数
 *   （实测 cost=1/次）。批量上限也实测过：110 个别名可以，120 开始报
 *   "Resource limits for this query exceeded"，所以批量大小取 100。
 *
 *   注意：GraphQL 不跟随仓库改名重定向，改名的仓库会返回 null，
 *   这类（以及整批失败时的）仓库会回落到 REST 逐个抓，行为与旧版一致。
 *
 * 用法：
 *   node tools/fetch-repo-data.mjs              # 只补缺失 / 超过 20 小时没刷新的
 *   node tools/fetch-repo-data.mjs --all        # 全部重新抓
 *   node tools/fetch-repo-data.mjs --dry-run    # 只抓不写，验证链路用
 *   node tools/fetch-repo-data.mjs --playwright # 强制用浏览器抓
 *
 * token 来源（按优先级）：
 *   GITHUB_TOKEN 环境变量 → GH_TOKEN 环境变量 → 本地 git 凭据（git credential fill）
 *
 * 写入字段：
 *   stars              star 数
 *   updated_at         最近推送时间
 *   default_branch     默认分支
 *   download_url       默认分支源码 zip 直链
 *   license            协议（仅在 GitHub 有明确识别结果时更新）
 *   archived           仓库是否已归档
 *
 * 数据完整性约定（2026-10 修）：
 *   · star 快照只写「本次真的抓到了」的仓库，没抓到的留 null（= 今天没观测），
 *     绝不拿旧值冒充当天快照，否则增量会被算成 0。
 *   · meta.json 的 refreshed_at 只在零失败时更新；有失败时保留旧时间并标
 *     partial，保证下一次运行会重抓，而不是锁死 20 小时。
 *   · 失败数超过 2% 或遇到限流时退出码为 1，让 Actions 变红而不是静默降级。
 */
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "projects.json");
const metaPath = join(root, "meta.json");
const historyPath = join(root, "data", "stars-history.json");
const projects = JSON.parse(await readFile(dataPath, "utf8"));

const FORCE_ALL = process.argv.includes("--all");
const FORCE_BROWSER = process.argv.includes("--playwright");
const DRY_RUN = process.argv.includes("--dry-run");

const GAP_MS = 120;
/** GraphQL 每批仓库数：实测 110 可用、120 开始报 Resource limits，取 100 */
const GQL_BATCH = 100;
/** 单批 GraphQL 失败后的重试次数（GitHub 偶发 502，实测失败率不低） */
const GQL_ATTEMPTS = 4;
/** 批次之间的间隔，别把 GitHub 打得太急 */
const GQL_GAP_MS = 600;
/** REST 回落时遇到限流，最多愿意等多久（毫秒） */
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;
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
const useApi = !!TOKEN && !FORCE_BROWSER;

/* --------------------------- 抓取：GraphQL 批量 --------------------------- */

const GQL_FIELDS = `stargazerCount pushedAt isArchived licenseInfo { spdxId } defaultBranchRef { name }`;

/** 把 repo 列表编成一条带别名的 GraphQL 查询（r0..rN） */
function buildGraphQLQuery(repos) {
    const aliases = repos.map((repo, index) => {
        const [owner, name] = repo.split("/");
        return `  r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${GQL_FIELDS} }`;
    });
    return `query {\n  rateLimit { limit remaining resetAt cost }\n${aliases.join("\n")}\n}`;
}

/** 发一条 GraphQL 请求；返回解析后的 payload（非 JSON 响应直接抛错） */
async function postGraphQL(query) {
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
    return { response, payload };
}

/** 把 GraphQL 节点映射成与 REST 一致的字段形态 */
function mapGraphQLNode(node) {
    return {
        stars: node.stargazerCount,
        updated_at: node.pushedAt || null,
        default_branch: node.defaultBranchRef ? node.defaultBranchRef.name : null,
        license: node.licenseInfo ? node.licenseInfo.spdxId : null,
        archived: node.isArchived === true
    };
}

/**
 * 批量抓一批仓库。
 * 返回 { results: Map<repo, {data} | {needsRest:true}>, error? }
 *   · 有 data 的直接用
 *   · needsRest 的（仓库改名 / 被删 / 别名字段缺失）回落到 REST
 *   · 整批失败时 results 为 null，调用方把这批全部回落到 REST
 */
async function fetchBatchViaGraphQL(repos) {
    const query = buildGraphQLQuery(repos);
    let lastError = "";

    for (let attempt = 1; attempt <= GQL_ATTEMPTS; attempt += 1) {
        try {
            const { response, payload } = await postGraphQL(query);

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
                    results.set(repo, node ? { data: mapGraphQLNode(node) } : { needsRest: true });
                });
                // 部分别名报错（Resource limits / 无法解析）时，对应项已经在上面变成 needsRest
                return { results, partialErrors: (payload.errors || []).length };
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
        response = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "opensource-market-refresh"
            }
        });
    } catch (error) {
        return { error: String(error.message || error).slice(0, 60) };
    }

    if (response.status === 404) return { skip: "仓库不存在或已转移" };
    if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        const reset = Number(response.headers.get("x-ratelimit-reset") || 0);
        // 只有 remaining=0 才是真的配额用尽；其它 403 是仓库被限制访问之类，直接记失败
        if (remaining === "0") return { rateLimited: true, resetAt: reset || 0 };
        return { error: `HTTP ${response.status}（非限流，可能是仓库访问受限）` };
    }
    if (!response.ok) return { error: `HTTP ${response.status}` };

    const info = await response.json();
    return {
        data: {
            stars: info.stargazers_count,
            updated_at: info.pushed_at || info.updated_at,
            default_branch: info.default_branch || "main",
            license: info.license && info.license.spdx_id ? info.license.spdx_id : null,
            archived: info.archived === true
        },
        renamedTo:
            info.full_name && info.full_name.toLowerCase() !== repo.toLowerCase() ? info.full_name : null
    };
}

/* --------------------------- 抓取：浏览器兜底 --------------------------- */

let browser = null;
let page = null;

async function ensureBrowser() {
    if (page) return;
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
    });
    page = await context.newPage();
}

async function fetchViaBrowser(repo) {
    await ensureBrowser();
    const response = await page.goto(`https://github.com/${repo}`, {
        waitUntil: "domcontentloaded",
        timeout: 40000
    });
    if (!response || response.status() >= 400) {
        return { error: `HTTP ${response ? response.status() : "?"}` };
    }

    await page.waitForSelector("relative-time, time", { timeout: 8000 }).catch(() => null);

    const data = await page.evaluate(() => {
        const html = document.documentElement.outerHTML;
        const starMatch =
            html.match(/"stargazerCount":\s*(\d+)/) || html.match(/"stargazers_count":\s*(\d+)/);
        const times = [
            ...document.querySelectorAll("relative-time"),
            ...document.querySelectorAll("time")
        ]
            .map((el) => el.getAttribute("datetime"))
            .filter(Boolean)
            .sort();
        return {
            stars: starMatch ? Number(starMatch[1]) : null,
            updated_at: times.length ? times[times.length - 1] : null
        };
    });

    if (data.stars === null && data.updated_at === null) return { error: "页面未解析到数据" };
    return { data };
}

/* ------------------------------ 主流程 ------------------------------ */

function needsWork(project) {
    if (FORCE_ALL) return true;
    if (typeof project.stars !== "number" || !project.updated_at) return true;
    // 数据超过 20 小时就全量重抓，避免定时任务静默空跑
    return hoursSinceRefresh() > 20;
}

/** 距上次刷新过了多少小时（读 meta.json，读不到就当很久以前） */
function hoursSinceRefresh() {
    try {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        const last = Date.parse(meta.refreshed_at);
        if (isNaN(last)) return Infinity;
        return (Date.now() - last) / 3600000;
    } catch {
        return Infinity;
    }
}

/* ---------------------- 协议 / 归档字段更新 ---------------------- */
// GitHub 有时会返回 NOASSERTION 或 null（协议文件改过、解析失败），
// 这种情况当成「没读到」，不能覆盖已有值。
// 变更记录由 tools/track-changes.mjs 统一比对生成。
const UNRELIABLE_LICENSE = new Set(["", "noassertion", "other", "none", "unknown"]);

function isReliableLicense(value) {
    return Boolean(value) && !UNRELIABLE_LICENSE.has(String(value).trim().toLowerCase());
}

/** 把一次抓取结果写进项目对象；返回 true 表示本次真的更新了数据 */
function applyResult(project, data) {
    const { stars, updated_at, default_branch, license, archived } = data;
    let touched = false;

    if (typeof stars === "number") {
        project.stars = stars;
        touched = true;
    }
    if (updated_at) {
        project.updated_at = updated_at;
        touched = true;
    }
    if (default_branch) {
        project.default_branch = default_branch;
        project.download_url = `https://codeload.github.com/${project.repo}/zip/refs/heads/${encodeURIComponent(default_branch)}`;
        touched = true;
    }

    // 协议：只在 GitHub 给出可信结果时才覆盖已有值
    if (isReliableLicense(license)) {
        project.license = license;
    }

    // 归档状态
    if (typeof archived === "boolean") {
        project.archived = archived;
    }

    return touched;
}

const targets = projects.filter(needsWork);

console.log(
    `共 ${projects.length} 个项目，本次需抓取 ${targets.length} 个｜方式：` +
        (useApi
            ? `GraphQL 批量（每批 ${GQL_BATCH} 个）+ REST 回落`
            : "Playwright 浏览器（无 token）") +
        (DRY_RUN ? "｜dry-run，不写文件" : "")
);

let ok = 0;
let failed = 0;
let skipped = 0;
let rateLimited = 0;
let gqlRequests = 0;
let restRequests = 0;
const refreshedRepos = new Set();
const failures = [];

function recordFailure(project, reason) {
    failed += 1;
    failures.push(`${project.repo} → ${reason}`);
    console.error(`\n失败  ${project.repo} -> ${reason}`);
}

/** 抓一个仓库并写回项目对象（REST 路径，含限流等待） */
async function fetchOneViaRest(project, allowWait = true) {
    restRequests += 1;
    let result = await fetchViaApi(project.repo);

    if (result.rateLimited && allowWait) {
        const waitMs = result.resetAt ? result.resetAt * 1000 - Date.now() + 3000 : 0;
        if (waitMs > 0 && waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
            console.log(
                `\n  [限流] 等待 ${Math.ceil(waitMs / 1000)}s 后重试 ${project.repo}（等到配额重置）`
            );
            await sleep(waitMs);
            restRequests += 1;
            result = await fetchViaApi(project.repo);
        }
    }

    if (result.rateLimited) {
        rateLimited += 1;
        recordFailure(project, "REST 限流（配额已用尽）");
        return false;
    }
    if (result.skip) {
        skipped += 1;
        console.log(`\n跳过  ${project.repo} -> ${result.skip}`);
        return false;
    }
    if (result.error) {
        recordFailure(project, result.error);
        return false;
    }

    if (result.renamedTo) {
        console.log(`\n提示  ${project.repo} 已改名为 ${result.renamedTo}，建议手动更新 repo 字段`);
    }
    if (applyResult(project, result.data)) {
        ok += 1;
        refreshedRepos.add(project.repo);
        return true;
    }
    return false;
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
            let good = 0;
            let toRest = 0;
            for (const project of batch) {
                const hit = results.get(project.repo);
                if (hit && hit.data && applyResult(project, hit.data)) {
                    ok += 1;
                    good += 1;
                    refreshedRepos.add(project.repo);
                } else {
                    toRest += 1;
                    restQueue.push(project);
                }
            }
            console.log(
                `[批次 ${i + 1}/${batches.length}] ${batch.length} 个 → 成功 ${good}，回落 REST ${toRest}`
            );
        }

        if (i < batches.length - 1) await sleep(GQL_GAP_MS);
    }

    /* ---- 第二轮：REST 回落（改名 / 已删除 / 批量失败） ---- */
    if (restQueue.length) {
        console.log(`\nREST 回落：${restQueue.length} 个（改名、已删除或批次失败）`);
        for (let i = 0; i < restQueue.length; i += 1) {
            await fetchOneViaRest(restQueue[i]);
            if (rateLimited > 0 && restQueue.length - i > 20) {
                // 已经等到配额重置都还失败，剩下的继续抓也只会一路 403，停下来等下次运行
                console.error(`限流已触发，停止 REST 回落（还剩 ${restQueue.length - i} 个），留待下次运行`);
                break;
            }
            if (i < restQueue.length - 1) await sleep(GAP_MS);
        }
    }
} else {
    /* ---- 无 token：浏览器兜底（行为与旧版一致） ---- */
    for (const project of targets) {
        let result;
        try {
            result = await fetchViaBrowser(project.repo);
        } catch (error) {
            result = { error: String(error.message || error).slice(0, 60) };
        }

        if (result.skip) {
            skipped += 1;
            console.log(`\n跳过  ${project.repo} -> ${result.skip}`);
        } else if (result.error) {
            recordFailure(project, result.error);
        } else if (applyResult(project, result.data)) {
            ok += 1;
            refreshedRepos.add(project.repo);
            process.stdout.write(".");
        }
        await sleep(2500);
    }
}

if (browser) await browser.close();

/* ------------------------------ 写盘 ------------------------------ */

const complete = failed === 0;

if (DRY_RUN) {
    console.log("\ndry-run：以上结果不会写入任何文件");
} else {
    await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");

    // meta.json：只有零失败才推进 refreshed_at，否则保留旧时间并标 partial，
    // 这样下一次运行（无论定时还是手动）会重新抓，而不是锁死 20 小时。
    let previousMeta = {};
    try {
        previousMeta = JSON.parse(readFileSync(metaPath, "utf8"));
    } catch {
        /* 首次运行 */
    }

    const meta = {
        refreshed_at: complete ? new Date().toISOString() : previousMeta.refreshed_at || null,
        total: projects.length,
        note: "由 tools/fetch-repo-data.mjs 自动生成"
    };
    if (!complete) {
        meta.partial = true;
        meta.partial_at = new Date().toISOString();
        meta.failed = failed;
        meta.ok = ok;
    }

    await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

/* ------------------------------ star 快照 ------------------------------ */
// 每天存一条，保留最近 30 天；同一天重复运行会覆盖当天的值。
// 只写「本次真的抓到了」的仓库：没抓到的留 null，表示今天没有观测，
// 绝不拿旧值冒充当天快照（否则增量会被算成 0，热门榜会静默丢项目）。
const KEEP_DAYS = 30;

async function writeStarsHistory(measured) {
    let history = { dates: [], series: {} };
    try {
        history = JSON.parse(await readFile(historyPath, "utf8"));
    } catch {
        /* 首次运行，文件不存在 */
    }
    if (!Array.isArray(history.dates)) history.dates = [];
    if (!history.series || typeof history.series !== "object") history.series = {};

    const today = new Date().toISOString().slice(0, 10);
    let index = history.dates.indexOf(today);
    if (index === -1) {
        history.dates.push(today);
        index = history.dates.length - 1;
    }

    for (const project of projects) {
        if (!project.repo || typeof project.stars !== "number") continue;
        const values = Array.isArray(history.series[project.repo]) ? history.series[project.repo] : [];
        // 补齐空位，保证数组和 dates 对齐
        while (values.length < index) values.push(null);

        if (measured.has(project.repo)) {
            values[index] = project.stars;
        } else if (typeof values[index] !== "number") {
            // 今天没测到，且当天也还没有有效观测 → 留空
            values[index] = null;
        }
        history.series[project.repo] = values;
    }

    // 超过保留天数就裁掉最早的
    if (history.dates.length > KEEP_DAYS) {
        const drop = history.dates.length - KEEP_DAYS;
        history.dates = history.dates.slice(drop);
        for (const key of Object.keys(history.series)) {
            history.series[key] = history.series[key].slice(drop);
        }
    }

    if (DRY_RUN) return history.dates.length;

    await writeFile(historyPath, JSON.stringify(history) + "\n", "utf8");
    return history.dates.length;
}

const historyDays = await writeStarsHistory(refreshedRepos);

/* ------------------------------ 汇总 ------------------------------ */

const haveStars = projects.filter((p) => typeof p.stars === "number").length;
const haveTime = projects.filter((p) => p.updated_at).length;

console.log(
    `\n完成：成功 ${ok} 个，失败 ${failed} 个，跳过 ${skipped} 个，限流 ${rateLimited} 次` +
        `\n请求数：GraphQL ${gqlRequests} 次 + REST ${restRequests} 次 = ${gqlRequests + restRequests} 次` +
        `\n累计：star ${haveStars}/${projects.length}，更新时间 ${haveTime}/${projects.length}` +
        `\nstar 快照：已记录 ${historyDays} 天${DRY_RUN ? "（dry-run 未写入）" : ""}`
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
