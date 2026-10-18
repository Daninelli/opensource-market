/**
 * 生成 trending.json：按「近 N 天 star 增量」排出热门榜。
 *
 * 数据来源：data/stars-history.json（由 tools/fetch-repo-data.mjs 每天写入）
 * 输出：trending.json（页面直接读，不需要在浏览器里算）
 *
 * 用法：node tools/build-trending.mjs
 *
 * 冷启动说明：
 *   历史不足 2 个数据点时无法算增量，此时 ready=false，
 *   榜单退化为「按 star 总数排序」，页面会显示提示文案。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_DAYS = 7;
const TOP_N = 20;

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

let history = { dates: [], series: {} };
try {
    history = JSON.parse(await readFile(join(root, "data", "stars-history.json"), "utf8"));
} catch {
    console.warn("没有找到 data/stars-history.json，将输出空榜单");
}

const dates = Array.isArray(history.dates) ? history.dates : [];
const series = history.series || {};
const historyDays = dates.length;

/** 取某个仓库在「第 daysAgo 天前」的 star 数（取不到返回 null） */
function starsAt(repo, daysAgo) {
    const values = series[repo];
    if (!Array.isArray(values) || !values.length) return null;
    const index = values.length - 1 - daysAgo;
    if (index < 0) return null;
    const value = values[index];
    return typeof value === "number" ? value : null;
}

/** 找出实际能回溯到的最远天数 */
function availableWindow(repo) {
    const values = series[repo];
    if (!Array.isArray(values) || values.length < 2) return 0;
    for (let i = 0; i < values.length; i += 1) {
        if (typeof values[i] === "number") {
            return values.length - 1 - i;
        }
    }
    return 0;
}

// 全局能用的窗口：取所有仓库里最长的，最多 7 天
let maxWindow = 0;
for (const repo of Object.keys(series)) {
    const window = availableWindow(repo);
    if (window > maxWindow) maxWindow = window;
}
const effectiveWindow = Math.min(WINDOW_DAYS, maxWindow);
const ready = effectiveWindow >= 1;
const partial = effectiveWindow < WINDOW_DAYS;

const rows = projects
    .filter((project) => project.repo)
    .map((project) => {
        const current = typeof project.stars === "number" ? project.stars : null;
        const past = ready ? starsAt(project.repo, effectiveWindow) : null;
        const past30 = starsAt(project.repo, 30);

        let delta = null;
        if (ready && current !== null && past !== null) {
            delta = current - past;
        }

        return {
            repo: project.repo,
            name: project.name,
            category: project.category,
            category_slug: project.category_slug,
            subcategory: project.subcategory || null,
            note_zh: project.note_zh || "",
            license: project.license || "",
            stars: current,
            delta7: delta,
            delta30: current !== null && past30 !== null ? current - past30 : null,
            window_days: effectiveWindow,
            updated_at: project.updated_at || null,
            download_url: project.download_url || null,
            platform: project.platform || "github",
            pinned: project.pinned === true
        };
    });

if (ready) {
    rows.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const da = a.delta7 === null ? -Infinity : a.delta7;
        const db = b.delta7 === null ? -Infinity : b.delta7;
        if (db !== da) return db - da;
        return (b.stars || 0) - (a.stars || 0);
    });
} else {
    // 冷启动：按 star 总数兜底
    rows.sort((a, b) => (b.stars || 0) - (a.stars || 0));
}

const items = rows.slice(0, TOP_N).map((row, index) => ({ rank: index + 1, ...row }));

const output = {
    generated_at: new Date().toISOString(),
    window_days: effectiveWindow,
    target_window_days: WINDOW_DAYS,
    history_days: historyDays,
    ready,
    partial,
    note: !ready
        ? `热度数据积累中（已记录 ${historyDays} 天），当前按 star 总数排序`
        : partial
          ? `按近 ${effectiveWindow} 天 star 增量排序（数据积累中，满 ${WINDOW_DAYS} 天后更准确）`
          : `按近 ${WINDOW_DAYS} 天 star 增量排序`,
    items
};

await writeFile(join(root, "trending.json"), JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(
    `trending.json 已生成：${items.length} 条｜历史 ${historyDays} 天｜` +
        (ready ? `按近 ${effectiveWindow} 天增量排序${partial ? "（数据积累中）" : ""}` : "冷启动，按 star 总数排序")
);
if (items.length) {
    items.slice(0, 5).forEach((item) => {
        const delta = item.delta7 === null ? "—" : "+" + item.delta7;
        console.log(`  ${item.rank}. ${item.name}  近7天 ${delta}  总 ${item.stars}`);
    });
}
