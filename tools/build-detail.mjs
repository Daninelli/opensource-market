/**
 * 生成详情页数据分片：data/detail/{owner__repo}.json
 *
 * 为什么分片：
 *   打开一个详情页只需要它自己那 2~3KB，不用下载全部项目的数据。
 *
 * 为什么这里不写 star 数据：
 *   star 数每天都会变。如果把 stars / star_series / 增量写进分片，
 *   159 个分片文件每天全部重写，Git 历史会被无意义的小改动灌满。
 *   所以分片只存「基本不变」的静态信息（项目元数据、安装包、置顶），
 *   star 曲线由前端去读共享的 data/stars-history.json 现算。
 *
 *   效果：分片只在项目元数据变化时才改动，日常几乎不动。
 */
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "data", "detail");

/** owner/repo → owner__repo（文件名安全，且可逆） */
function toSlug(repo) {
    return String(repo).replace("/", "__");
}

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

// 变更记录：协议变更、归档等，由 fetch-repo-data.mjs 自动累积
let changeLog = { events: [] };
try {
    changeLog = JSON.parse(await readFile(join(root, "data", "changes.json"), "utf8"));
} catch {
    /* 还没有变更记录 */
}
const allEvents = Array.isArray(changeLog.events) ? changeLog.events : [];

// 按仓库分组，省得每个项目扫一遍全表
const eventsByRepo = new Map();
for (const event of allEvents) {
    if (!event.repo) continue;
    if (!eventsByRepo.has(event.repo)) eventsByRepo.set(event.repo, []);
    eventsByRepo.get(event.repo).push(event);
}

await mkdir(OUT_DIR, { recursive: true });

// 清掉旧分片，避免项目被删除后留下孤儿文件
try {
    const existing = await readdir(OUT_DIR);
    await Promise.all(existing.filter((f) => f.endsWith(".json")).map((f) => unlink(join(OUT_DIR, f))));
} catch {
    /* 目录本来就是空的 */
}

let written = 0;
let withRelease = 0;
let withAssets = 0;

for (const project of projects) {
    if (!project.repo) continue;

    const assets = Array.isArray(project.best_assets) ? project.best_assets.slice(0, 8) : [];
    if (project.release) withRelease += 1;
    if (assets.length) withAssets += 1;

    const detail = {
        repo: project.repo,
        slug: toSlug(project.repo),
        name: project.name,
        note_zh: project.note_zh || "",
        category: project.category,
        category_slug: project.category_slug,
        subcategory: project.subcategory || null,
        subcategory_slug: project.subcategory_slug || null,
        license: project.license || "",
        license_category: project.license_category || "unknown",
        archived: project.archived === true,
        tech_stack: Array.isArray(project.tech_stack) ? project.tech_stack : [],
        deploy_type: project.deploy_type || "",
        platform: project.platform || "github",

        updated_at: project.updated_at || null,
        added_at: project.added_at || null,
        default_branch: project.default_branch || "main",
        download_url: project.download_url || null,

        release: project.release || null,
        assets,

        pinned: project.pinned === true,
        pin_label: project.pin_label || null,
        pin_note: project.pin_note || null,
        submitted_by: project.submitted_by || null,

        gitee: project.gitee_repo
            ? {
                  repo: project.gitee_repo,
                  url: project.gitee_url || `https://gitee.com/${project.gitee_repo}`,
                  stars: typeof project.gitee_stars === "number" ? project.gitee_stars : null
              }
            : null,

        // 变动记录（协议变更 / 归档等），没有就是空数组
        changes: eventsByRepo.get(project.repo) || []
    };

    await writeFile(join(OUT_DIR, `${detail.slug}.json`), JSON.stringify(detail, null, 2) + "\n", "utf8");
    written += 1;
}

console.log(`详情分片已生成：${written} 个 → data/detail/`);
console.log(`  带 Release 版本：${withRelease} 个`);
console.log(`  带安装包：${withAssets} 个`);
console.log(`  （star 数据不写入分片，由页面读取 stars-history.json 现算）`);