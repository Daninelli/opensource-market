/**
 * 生成涨星榜：data/star-growth.json
 *
 * 为什么单独一个文件：
 *   trending.json 只给首页热门榜 Top 20，涨星榜要全量 1699 个。
 *   合在一起会让首页每次多下载约 230KB，所以拆开生成。
 *
 * 用法：node tools/build-growth.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_DAYS = 7;

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

let history = { dates: [], series: {} };
try {
    history = JSON.parse(await readFile(join(root, "data", "stars-history.json"), "utf8"));
} catch {
    console.warn("没有找到 data/stars-history.json，将输出无增量数据的榜单");
}

const dates = Array.isArray(history.dates) ? history.dates : [];
const series = history.series || {};
const historyDays = dates.length;

// 历史不足 7 天时按实际可用天数降级，避免「近 7 天」算出假增量
const windowDays = Math.max(0, Math.min(WINDOW_DAYS, historyDays - 1));

/** 取某仓库的窗口增量；算不出返回 null（绝不编造 0） */
function deltaOf(repo) {
    if (windowDays <= 0) return null;
    const values = series[repo];
    if (!Array.isArray(values) || values.length < windowDays + 1) return null;
    const last = values[values.length - 1];
    const base = values[values.length - 1 - windowDays];
    if (typeof last !== "number" || typeof base !== "number") return null;
    return last - base;
}

const items = projects
    .filter((project) => project.repo)
    .map((project) => ({
        repo: project.repo,
        name: project.name,
        category: project.category,
        category_slug: project.category_slug,
        subcategory: project.subcategory || null,
        stars: typeof project.stars === "number" ? project.stars : null,
        delta7: deltaOf(project.repo)
    }));

// 排序：增量降序 → null 垫底 → star 总数降序 → repo 字典序（保证输出稳定，避免无意义 diff）
items.sort((a, b) => {
    const da = a.delta7 === null ? -Infinity : a.delta7;
    const db = b.delta7 === null ? -Infinity : b.delta7;
    if (db !== da) return db - da;
    const sa = a.stars === null ? -1 : a.stars;
    const sb = b.stars === null ? -1 : b.stars;
    if (sb !== sa) return sb - sa;
    return a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0;
});

const output = {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    history_days: historyDays,
    count: items.length,
    items
};

// 紧凑输出：缩进会把体积从约 249KB 撑到约 358KB
await writeFile(
    join(root, "data", "star-growth.json"),
    JSON.stringify(output) + "\n",
    "utf8"
);

const withDelta = items.filter((x) => x.delta7 !== null);
const up = withDelta.filter((x) => x.delta7 > 0).length;
const flat = withDelta.filter((x) => x.delta7 === 0).length;
const down = withDelta.filter((x) => x.delta7 < 0).length;

console.log(
    `star-growth.json 已生成：${items.length} 条｜窗口 ${windowDays} 天｜历史 ${historyDays} 天`
);
console.log(`  可算增量 ${withDelta.length} 个：涨 ${up} / 平 ${flat} / 跌 ${down}`);
items.slice(0, 5).forEach((x, i) => {
    console.log(`  ${i + 1}. ${x.name}  +${x.delta7}  总 ${x.stars}`);
});
