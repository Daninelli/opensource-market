/**
 * 用 Playwright 抓取每个项目的 star 数与最近更新时间，写回 projects.json。
 *
 * 为什么不直接调 GitHub API：匿名 API 配额只有 60 次/小时（按出口 IP 计），
 * 57 个项目一次就抓完，重复运行必被限流。而仓库网页里本身就有这两个数据，
 * 抓网页不消耗任何 API 配额。
 *
 * 用法：
 *   node tools/fetch-repo-data.mjs            # 只补缺失的项
 *   node tools/fetch-repo-data.mjs --all      # 全部重新抓
 *
 * 抓取策略（避免把 IP 打到限流）：
 *   - 复用同一个标签页，不反复开关浏览器
 *   - 每个仓库之间固定间隔
 *   - 遇到超时 / 连接重置自动退避后重试，重试仍失败就跳过，等下次再补
 *   - 只写成功抓到的字段，已有数据不会被覆盖成空
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "projects.json");
const projects = JSON.parse(await readFile(dataPath, "utf8"));

const FORCE_ALL = process.argv.includes("--all");
const GAP_MS = 2500; // 每个仓库之间的间隔
const RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 需要抓的项：默认只抓缺 stars 或缺 updated_at 的 */
function needsWork(project) {
    if (FORCE_ALL) return true;
    return typeof project.stars !== "number" || !project.updated_at;
}

const targets = projects.filter(needsWork);
console.log(
    `共 ${projects.length} 个项目，本次需要抓取 ${targets.length} 个${FORCE_ALL ? "（--all 全量）" : "（仅缺失项）"}`
);

if (!targets.length) {
    console.log("数据已完整，无需抓取。");
    process.exit(0);
}

const browser = await chromium.launch();
const context = await browser.newContext({
    userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    viewport: { width: 1440, height: 900 }
});
const page = await context.newPage();

let ok = 0;
let fail = 0;
let gotTime = 0;

for (const project of targets) {
    let done = false;

    for (let attempt = 1; attempt <= RETRIES && !done; attempt++) {
        try {
            const response = await page.goto(`https://github.com/${project.repo}`, {
                waitUntil: "domcontentloaded",
                timeout: 40000
            });
            if (!response || response.status() >= 400) {
                throw new Error(`HTTP ${response ? response.status() : "?"}`);
            }

            // 时间元素由前端异步挂载，等一下；等不到不影响 star
            await page.waitForSelector("relative-time, time", { timeout: 8000 }).catch(() => null);

            const data = await page.evaluate(() => {
                const html = document.documentElement.outerHTML;

                const starMatch =
                    html.match(/"stargazerCount":\s*(\d+)/) ||
                    html.match(/"stargazers_count":\s*(\d+)/) ||
                    html.match(/id="repo-stars-counter-star"[^>]*title="([\d,]+)"/);

                const times = [
                    ...document.querySelectorAll("relative-time"),
                    ...document.querySelectorAll("time-ago, time")
                ]
                    .map((el) => el.getAttribute("datetime"))
                    .filter(Boolean)
                    .sort();

                return {
                    stars: starMatch ? Number(String(starMatch[1]).replace(/,/g, "")) : null,
                    updatedAt: times.length ? times[times.length - 1] : null
                };
            });

            if (data.stars === null && data.updatedAt === null) {
                throw new Error("页面里没解析到数据");
            }

            // 只写抓到的字段，已有数据不会被空值覆盖
            if (data.stars !== null) project.stars = data.stars;
            if (data.updatedAt) {
                project.updated_at = data.updatedAt;
                gotTime += 1;
            }

            ok += 1;
            done = true;
            process.stdout.write(".");
        } catch (error) {
            const msg = String(error.message || error).slice(0, 70);
            if (attempt < RETRIES) {
                // 退避后重试，避免持续撞上限流
                await sleep(8000 * attempt);
            } else {
                fail += 1;
                console.error(`\n跳过  ${project.repo} -> ${msg}`);
            }
        }
    }

    await sleep(GAP_MS);
}

await browser.close();

// 每抓完一个就落盘，避免中途失败丢失结果
await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");

const haveStars = projects.filter((p) => typeof p.stars === "number").length;
const haveTime = projects.filter((p) => p.updated_at).length;
console.log(`\n本次成功 ${ok} 个，失败 ${fail} 个，其中补到更新时间 ${gotTime} 个`);
console.log(`累计：star ${haveStars}/${projects.length}，更新时间 ${haveTime}/${projects.length}`);