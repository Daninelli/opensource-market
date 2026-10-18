/**
 * 生成 recent.json：最近 N 天新收录的项目列表。
 *
 * 为什么单独生成一个文件：
 *   projects.json 会随项目数量线性膨胀（1 万条约 2MB gzip），
 *   但「最近收录」页面只需要 7 天内的数据，单独抽出来只有几 KB，
 *   页面就不必为了一屏列表下载全量数据。
 *
 * 用法：node tools/build-recent.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAYS = 7;

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));
let meta = {};
try {
    meta = JSON.parse(await readFile(join(root, "meta.json"), "utf8"));
} catch {
    // meta.json 还没生成时不影响主流程
}

const cutoff = Date.now() - DAYS * 86400000;

const items = projects
    .filter((project) => {
        const added = Date.parse(project.added_at || "");
        return !Number.isNaN(added) && added >= cutoff;
    })
    .sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
    .map((project) => ({
        name: project.name,
        repo: project.repo,
        added_at: project.added_at,
        category: project.category,
        category_slug: project.category_slug,
        subcategory: project.subcategory || null,
        note_zh: project.note_zh || "",
        license: project.license || "",
        stars: typeof project.stars === "number" ? project.stars : null,
        updated_at: project.updated_at || null,
        download_url: project.download_url || null,
        platform: project.platform || "github",
        // 贡献者：来自投稿 Issue 的作者；早期收录的项目没有这个字段
        submitted_by: project.submitted_by || null
    }));

const output = {
    generated_at: new Date().toISOString(),
    refreshed_at: meta.refreshed_at || null,
    days: DAYS,
    total_projects: projects.length,
    count: items.length,
    items
};

await writeFile(join(root, "recent.json"), JSON.stringify(output, null, 2) + "\n", "utf8");

const size = (await readFile(join(root, "recent.json"))).length;
console.log(
    `recent.json 已生成：${items.length} 条（最近 ${DAYS} 天）｜` +
        `${(size / 1024).toFixed(1)}KB｜全量 ${projects.length} 个项目`
);
items.slice(0, 5).forEach((item) => {
    console.log(`  ${item.added_at.slice(0, 16).replace("T", " ")}  ${item.name}`);
});