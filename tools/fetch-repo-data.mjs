/**
 * 抓取每个项目的 star 数、最近更新时间、默认分支，写回 projects.json。
 *
 * 两种抓取方式，自动选择：
 *   1) 有 token  → GitHub REST API（额度 5000 次/小时，57 个项目几秒跑完）
 *   2) 没 token  → Playwright 打开仓库网页解析（不消耗 API 额度，但慢且易被连接重置）
 *
 * 用法：
 *   node tools/fetch-repo-data.mjs              # 只补缺失的项
 *   node tools/fetch-repo-data.mjs --all        # 全部重新抓
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
 * 同时做协议/归档的变更比对，把变化追加到 data/changes.json，
 * 供详情页展示「变动记录」。全部自动完成，不需要人工核对。
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
const GAP_MS = 120;

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

/* ------------------------------ 抓取：API ------------------------------ */

async function fetchViaApi(repo) {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "opensource-market-refresh"
        }
    });

    if (response.status === 404) return { skip: "仓库不存在或已转移" };
    if (response.status === 403 || response.status === 429) {
        return { error: `限流（剩余 ${response.headers.get("x-ratelimit-remaining") ?? "?"}）` };
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
        }
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

const targets = projects.filter(needsWork);

console.log(
    `共 ${projects.length} 个项目，本次需抓取 ${targets.length} 个｜方式：` +
        (useApi ? "REST API（token 已就绪）" : "Playwright 浏览器（无 token）")
);

let ok = 0;
let failed = 0;
let skipped = 0;

/* ---------------------- 协议 / 归档字段更新 ---------------------- */
// GitHub 有时会返回 NOASSERTION 或 null（协议文件改过、解析失败），
// 这种情况当成「没读到」，不能覆盖已有值。
// 变更记录由 tools/track-changes.mjs 统一比对生成。
const UNRELIABLE_LICENSE = new Set(["", "noassertion", "other", "none", "unknown"]);

function isReliableLicense(value) {
    return Boolean(value) && !UNRELIABLE_LICENSE.has(String(value).trim().toLowerCase());
}

for (const project of targets) {
    let result;
    try {
        result = useApi ? await fetchViaApi(project.repo) : await fetchViaBrowser(project.repo);
    } catch (error) {
        result = { error: String(error.message || error).slice(0, 60) };
    }

    if (result.skip) {
        skipped += 1;
        console.log(`\n跳过  ${project.repo} -> ${result.skip}`);
    } else if (result.error) {
        failed += 1;
        console.error(`\n失败  ${project.repo} -> ${result.error}`);
    } else {
        const { stars, updated_at, default_branch, license, archived } = result.data;
        if (typeof stars === "number") project.stars = stars;
        if (updated_at) project.updated_at = updated_at;
        if (default_branch) {
            project.default_branch = default_branch;
            project.download_url = `https://codeload.github.com/${project.repo}/zip/refs/heads/${encodeURIComponent(default_branch)}`;
        }

        // 协议：只在 GitHub 给出可信结果时才覆盖已有值
        if (isReliableLicense(license)) {
            project.license = license;
        }

        // 归档状态
        if (typeof archived === "boolean") {
            project.archived = archived;
        }

        ok += 1;
        process.stdout.write(".");
    }

    await sleep(useApi ? GAP_MS : 2500);
}

if (browser) await browser.close();

await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");

// 同时写一份 meta.json，供页面显示「数据刷新于 …」
await writeFile(
    metaPath,
    JSON.stringify(
        {
            refreshed_at: new Date().toISOString(),
            total: projects.length,
            note: "由 tools/fetch-repo-data.mjs 自动生成"
        },
        null,
        2
    ) + "\n",
    "utf8"
);

/* ------------------------------ star 快照 ------------------------------ */
// 每天存一条，保留最近 30 天；同一天重复运行会覆盖当天的值
const KEEP_DAYS = 30;

async function writeStarsHistory() {
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
        values[index] = project.stars;
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

    await writeFile(historyPath, JSON.stringify(history) + "\n", "utf8");
    return history.dates.length;
}

const historyDays = await writeStarsHistory();

const haveStars = projects.filter((p) => typeof p.stars === "number").length;
const haveTime = projects.filter((p) => p.updated_at).length;

console.log(
    `\n完成：成功 ${ok} 个，失败 ${failed} 个，跳过 ${skipped} 个` +
        `\n累计：star ${haveStars}/${projects.length}，更新时间 ${haveTime}/${projects.length}` +
        `\nstar 快照：已记录 ${historyDays} 天`
);