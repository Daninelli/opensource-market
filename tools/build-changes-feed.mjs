/**
 * 把 data/changes.json 的变动事件整理成页面可直接渲染的 data/changes-feed.json。
 *
 * 为什么要单独生成：
 *   changes.json 里还存着全部项目的状态快照（给比对用），体积比事件本身大得多。
 *   页面只需要事件，所以这里做一次瘦身 + 补上项目名、分类等展示字段。
 *
 * 用法：
 *   node tools/build-changes-feed.mjs                    读 projects.json
 *   node tools/build-changes-feed.mjs path/to/projects.json   指定数据源
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectsArg = process.argv[2];
const projectsPath = projectsArg ? join(root, projectsArg) : join(root, "projects.json");
const changesPath = join(root, "data", "changes.json");
const outPath = join(root, "data", "changes-feed.json");

const projects = JSON.parse(await readFile(projectsPath, "utf8"));
const byRepo = new Map(projects.map((p) => [p.repo, p]));

let log = { events: [], state: {} };
try {
    log = JSON.parse(await readFile(changesPath, "utf8"));
} catch {
    /* 还没有变更记录 */
}

const events = Array.isArray(log.events) ? log.events : [];

// 只保留仍然在收录列表里的项目；已移除的项目不展示
const items = events
    .filter((e) => byRepo.has(e.repo))
    .map((e) => {
        const project = byRepo.get(e.repo);
        return {
            date: e.date,
            repo: e.repo,
            name: project.name,
            category: project.category,
            category_slug: project.category_slug,
            type: e.type,
            from: e.from ?? null,
            to: e.to ?? null
        };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// 统计覆盖范围，页面用来解释「从什么时候开始记的」
let since = null;
try {
    const info = await stat(changesPath);
    since = info.mtime.toISOString().slice(0, 10);
} catch {
    /* 没有文件 */
}

const feed = {
    note: "由 tools/build-changes-feed.mjs 自动生成；只含变动事件，不含状态快照",
    generated_at: new Date().toISOString(),
    monitored: projects.filter((p) => p.repo).length,
    since,
    total: items.length,
    items
};

await writeFile(outPath, JSON.stringify(feed, null, 2) + "\n", "utf8");

console.log(`变动记录页数据已生成：${items.length} 条 → data/changes-feed.json`);
console.log(`  监控项目：${feed.monitored} 个`);
if (!items.length) {
    console.log("  目前没有变动事件（系统刚建立基线，之后的变化会自动记录）");
}