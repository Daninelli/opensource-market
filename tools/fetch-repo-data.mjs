/**
 * 抓取每个项目的 GitHub 数据，写回 projects.json：
 *   stars         star 数
 *   updated_at    最后推送时间
 *   default_branch 默认分支
 *   download_url  默认分支源码 zip 直链（codeload）
 *
 * 本地运行（匿名配额 60 次/小时，建议用带 token 的方式）：
 *   node tools/fetch-repo-data.mjs
 *   GITHUB_TOKEN=xxx node tools/fetch-repo-data.mjs
 *
 * GitHub Actions 里用 secrets.GITHUB_TOKEN 自动运行（见 .github/workflows/refresh-data.yml），
 * 那个令牌自带 5000 次/小时配额，不受匿名限制。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "projects.json");

const TOKEN = process.env.GITHUB_TOKEN || "";
const HEADERS = {
    "User-Agent": "opensource-market-refresh",
    Accept: "application/vnd.github+json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRepo(repo) {
    const response = await fetch(`https://api.github.com/repos/${repo}`, { headers: HEADERS });
    if (response.status === 404) return { skip: "仓库不存在或已转移" };
    if (!response.ok) {
        const body = await response.text();
        return { error: `HTTP ${response.status} ${body.slice(0, 80)}` };
    }
    return { data: await response.json() };
}

const projects = JSON.parse(await readFile(dataPath, "utf8"));

let updated = 0;
let failed = 0;
let skipped = 0;

for (const project of projects) {
    let result;
    try {
        result = await fetchRepo(project.repo);
    } catch (error) {
        result = { error: String(error.message || error) };
    }

    if (result.skip) {
        skipped += 1;
        console.log(`跳过  ${project.repo} -> ${result.skip}`);
    } else if (result.error) {
        failed += 1;
        console.error(`失败  ${project.repo} -> ${result.error}`);
    } else {
        const info = result.data;
        const before = project.stars;
        project.stars = info.stargazers_count;
        project.updated_at = info.pushed_at || info.updated_at;
        project.default_branch = info.default_branch || project.default_branch || "main";
        project.download_url =
            `https://codeload.github.com/${project.repo}/zip/refs/heads/${project.default_branch}`;
        if (before !== info.stargazers_count) updated += 1;
        process.stdout.write(".");
    }

    await sleep(TOKEN ? 120 : 1000);
}

await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");

console.log(`\n完成：共 ${projects.length} 个，star 有变化 ${updated} 个，失败 ${failed} 个，跳过 ${skipped} 个`);
if (!TOKEN && failed > 0) {
    console.log("提示：匿名 API 配额只有 60 次/小时，配额耗尽时会全部失败；设置 GITHUB_TOKEN 后配额提高到 5000 次/小时。");
}