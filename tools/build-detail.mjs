/**
 * 生成详情页数据分片：data/detail/{owner__repo}.json
 *
 * 为什么分片而不是一个大文件：
 *   打开一个详情页只需要它自己那 3~4KB，不用下载全部 159 个项目的数据。
 *   项目涨到上千个也不会变慢。
 *
 * 数据来源（全部零额外开销）：
 *   projects.json          基础字段、安装包、置顶信息
 *   data/stars-history.json star 每日快照 → 曲线与增量
 */
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "data", "detail");

const WINDOW = 7;

/** owner/repo → owner__repo（文件名安全，且可逆） */
function toSlug(repo) {
    return String(repo).replace("/", "__");
}

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

let history = { dates: [], series: {} };
try {
    history = JSON.parse(await readFile(join(root, "data", "stars-history.json"), "utf8"));
} catch {
    console.warn("没有 stars-history.json，曲线数据将为空");
}

const dates = Array.isArray(history.dates) ? history.dates : [];

/** 取某个仓库的完整序列（对齐日期，缺失补 null） */
function seriesFor(repo) {
    const values = history.series[repo];
    if (!Array.isArray(values)) return [];
    return dates.map((date, i) => ({
        date,
        stars: typeof values[i] === "number" ? values[i] : null
    }));
}

/**
 * 计算 N 天增量。
 *
 * 重要：只有快照天数足够覆盖整个窗口时才算。
 * 否则会出现「近 7 天」和「近 30 天」算出同一个数字的假数据。
 */
function deltaFor(repo, days) {
    const values = history.series[repo];
    if (!Array.isArray(values) || values.length < days + 1) return null;
    const last = values[values.length - 1];
    if (typeof last !== "number") return null;
    const base = values[values.length - 1 - days];
    return typeof base === "number" ? last - base : null;
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
let withSeries = 0;

for (const project of projects) {
    if (!project.repo) continue;

    const series = seriesFor(project.repo);
    const points = series.filter((p) => p.stars !== null).length;
    if (points >= 2) withSeries += 1;

    // 同平台保留展示顺序：安装包按体积降序，最多 8 个
    const assets = Array.isArray(project.best_assets) ? project.best_assets.slice(0, 8) : [];

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
        tech_stack: Array.isArray(project.tech_stack) ? project.tech_stack : [],
        deploy_type: project.deploy_type || "",
        platform: project.platform || "github",

        stars: typeof project.stars === "number" ? project.stars : null,
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

        // star 曲线：只有 >= 2 个有效点才有意义，否则前端显示「积累中」
        star_series: points >= 2 ? series : [],
        star_points: points,
        history_days: dates.length,
        delta_7d: deltaFor(project.repo, WINDOW),
        delta_30d: deltaFor(project.repo, 30)
    };

    await writeFile(join(OUT_DIR, `${detail.slug}.json`), JSON.stringify(detail, null, 2) + "\n", "utf8");
    written += 1;
}

console.log(`详情分片已生成：${written} 个 → data/detail/`);
console.log(`  有 star 曲线（>=2 个点）：${withSeries} 个`);
console.log(`  快照天数：${dates.length}（满 ${WINDOW} 天后曲线才有意义）`);