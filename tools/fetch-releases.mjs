/**
 * 抓取每个项目的最新 Release 及其安装包，写回 projects.json。
 *
 * 用法：
 *   node tools/fetch-releases.mjs
 *   GITHUB_TOKEN=xxx node tools/fetch-releases.mjs
 *
 * 写入结构：
 *   release.tag        版本号，如 v1.2.3
 *   release.name       Release 标题
 *   release.published  发布时间
 *   release.url        Release 页面地址
 *   release.assets[]   每个安装包：name / size / url / downloads
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
const projects = JSON.parse(await readFile(dataPath, "utf8"));

let withAssets = 0;
let noRelease = 0;
let errored = 0;

for (const project of projects) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${project.repo}/releases/latest`,
            { headers: HEADERS }
        );

        if (response.status === 404) {
            noRelease += 1;
            delete project.release;
            process.stdout.write("-");
        } else if (!response.ok) {
            errored += 1;
            console.error(`\n[HTTP ${response.status}] ${project.repo}`);
            process.stdout.write("!");
        } else {
            const release = await response.json();
            const assets = (release.assets || []).map((a) => ({
                name: a.name,
                size: a.size,
                url: a.browser_download_url,
                downloads: a.download_count
            }));

            if (assets.length) {
                project.release = {
                    tag: release.tag_name,
                    name: release.name || release.tag_name,
                    published: release.published_at,
                    url: release.html_url,
                    assets
                };
                withAssets += 1;
                process.stdout.write("+");
            } else {
                noRelease += 1;
                delete project.release;
                process.stdout.write("o");
            }
        }
    } catch (error) {
        errored += 1;
        console.error(`\n失败 ${project.repo} -> ${String(error.message).slice(0, 60)}`);
    }

    await sleep(TOKEN ? 150 : 1000);
}

await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");

console.log(`\n有安装包的 ${withAssets} 个，无 Release/无附件 ${noRelease} 个，错误 ${errored} 个`);
if (!TOKEN && errored > 0) {
    console.log("提示：匿名 API 配额 60 次/小时；设置 GITHUB_TOKEN 后为 5000 次/小时。");
}