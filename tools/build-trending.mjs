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
const ready = historyDays >= 2;

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
    let first = null;
    for (let i = 0; i < values.length; i += 1) {
        if (typeof values[i] === "number") {
            first = values[i];
            break;
        }
    }
    if (first === null) return 0;
    return values.length - 1;
}

const rows = projects
    .filter((project) => project.repo)
    .map((project) => {
        const current = typeof project.stars === "number" ? project.stars : null;
        const past7 = ready ? starsAt(project.repo, WINDOW_DAYS) : null;
        const past30 = ready ? starsAt(project.repo, 30) : null;
        const window = ready ? availableWindow(project.repo) : 0;

        let delta = null;
        if (ready && current !== null && past7 !== null) {
            delta = current - past7;
        } else if (ready && current !== null && window > 0) {
            // 历史不足 7 天时，用现有最长窗口估算
            const base = starsAt(project.repo, window);
            if (base !== null) delta = current - base;
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
            delta30: ready && current !== null && past30 !== null ? current - past30 : null,
            window_days: window,
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
    window_days: WINDOW_DAYS,
    history_days: historyDays,
    ready,
    note: ready
        ? `按近 ${WINDOW_DAYS} 天 star 增量排序`
        : `热度数据积累中（已记录 ${historyDays} 天，至少需要 2 天），当前按 star 总数排序`,
    items
};

await writeFile(join(root, "trending.json"), JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(
    `trending.json 已生成：${items.length} 条｜历史 ${historyDays} 天｜` +
        (ready ? `按近 ${WINDOW_DAYS} 天增量排序` : "冷启动，按 star 总数排序")
);
if (items.length) {
    items.slice(0, 5).forEach((item) => {
        const delta = item.delta7 === null ? "—" : "+" + item.delta7;
        console.log(`  ${item.rank}. ${item.name}  近7天 ${delta}  总 ${item.stars}`);
    });
}
