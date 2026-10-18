/**
 * 自动判定每个项目的许可协议属于哪一类，写回 projects.json 的 license_category。
 *
 * 为什么要这一步：
 *   站点定位是「开源成品应用」，但实际收录里有一部分项目用的是
 *   BUSL / SSPL / Elastic License / Sustainable Use 这类「源码可用但非开源」的协议。
 *   人工逐个核对跟不上，所以按 SPDX id 自动分类。
 *
 * 三个分类：
 *   open        OSI 认可的开源协议（MIT / Apache / GPL / AGPL / MPL / BSD …）
 *   restricted  源码可用但限制商用，不属于 OSI 开源（BUSL / SSPL / ELv2 / 自定义社区协议）
 *   unknown     GitHub 未识别（NOASSERTION / 空 / 不认识的字符串）
 *
 * 用法：node tools/classify-licenses.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** OSI 认可的开源协议（小写比较） */
const OPEN = new Set(
    [
        "MIT",
        "Apache-2.0",
        "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later",
        "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
        "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
        "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later",
        "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later",
        "MPL-2.0", "EPL-1.0", "EPL-2.0",
        "BSD-2-Clause", "BSD-3-Clause", "BSD-4-Clause",
        "ISC", "Zlib", "CC0-1.0", "Unlicense", "0BSD",
        "BSL-1.0", "Artistic-2.0", "PostgreSQL", "Python-2.0",
        "CDDL-1.0", "CDDL-1.1", "EUPL-1.2", "OSL-3.0", "NCSA"
    ].map((s) => s.toLowerCase())
);

/**
 * 源码可用、但明确不属于 OSI 开源的协议。
 * 注意：这些项目不是「盗版」，它们只是不满足开源定义（通常限制商用/托管服务）。
 */
const RESTRICTED_EXACT = new Set(
    [
        "BUSL-1.1",
        "SSPL-1.0",
        "Elastic-2.0",
        "ELv2"
    ].map((s) => s.toLowerCase())
);

/** 自定义社区协议：描述性字符串，靠关键词匹配 */
const RESTRICTED_PATTERNS = [
    /sustainable\s+use/i,        // n8n
    /business\s+source/i,        // BUSL 的文字写法
    /server\s+side\s+public/i,   // SSPL
    /elastic\s+license/i,        // Elastic
    /commons\s+clause/i,
    /fair\s+(source|core)/i,
    /community\s+license/i,      // PLANKA Community License
    /mscl/i,                     // Directus 的 MSCL
    /non-?commercial/i,
    /research\s+only/i,
    /仅限.*非商业/,
    /不得用于商业/
];

/** GitHub 明确表示「没有识别出协议」的返回值 */
const UNKNOWN_MARKERS = new Set(["noassertion", "other", "", "none", "unknown"]);

function classify(raw) {
    const license = String(raw || "").trim();
    const key = license.toLowerCase();

    if (!license || UNKNOWN_MARKERS.has(key)) return "unknown";
    if (OPEN.has(key)) return "open";
    if (RESTRICTED_EXACT.has(key)) return "restricted";
    if (RESTRICTED_PATTERNS.some((re) => re.test(license))) return "restricted";

    // 其他未被收录的 SPDX 标识：可能是新的开源协议，先记为 unknown，
    // 让 check-data 把它打出来，人工确认后再补进上面的清单。
    return "unknown";
}

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

const stats = { open: 0, restricted: 0, unknown: 0 };
const changed = [];
const restrictedList = [];

for (const project of projects) {
    const category = classify(project.license);
    stats[category] += 1;

    if (project.license_category !== category) {
        changed.push({ name: project.name, from: project.license_category || "(无)", to: category });
    }
    project.license_category = category;

    if (category === "restricted") restrictedList.push(project);
}

await writeFile(join(root, "projects.json"), JSON.stringify(projects, null, 2) + "\n", "utf8");

const total = projects.length;
console.log("协议分类完成：");
console.log(`  开源 (open)        ${String(stats.open).padStart(4)} 个  ${((stats.open / total) * 100).toFixed(1)}%`);
console.log(`  限制性 (restricted) ${String(stats.restricted).padStart(3)} 个  ${((stats.restricted / total) * 100).toFixed(1)}%`);
console.log(`  未知 (unknown)      ${String(stats.unknown).padStart(3)} 个  ${((stats.unknown / total) * 100).toFixed(1)}%`);

if (changed.length) {
    // 首次运行时全部项目都没有分类，不算「变化」，单独统计避免日志刷屏
    const realChanges = changed.filter((c) => c.from !== "(无)");
    if (realChanges.length) {
        console.log(`\n分类发生变化：${realChanges.length} 个`);
        realChanges.forEach((c) => console.log(`  ${c.name}: ${c.from} → ${c.to}`));
    } else {
        console.log(`\n首次标注 ${changed.length} 个项目`);
    }
}

if (restrictedList.length) {
    console.log(`\n限制性协议项目（页面上会自动标注「非开源」）：`);
    restrictedList
        .sort((a, b) => (b.stars || 0) - (a.stars || 0))
        .forEach((p) => console.log(`  ${p.name.padEnd(18)} ★${String(p.stars || 0).padStart(7)}  ${p.license}`));
}

const unknownList = projects.filter((p) => p.license_category === "unknown");
if (unknownList.length) {
    console.log(`\n未识别协议（需要人工确认后补进清单）：`);
    unknownList.forEach((p) => console.log(`  ${p.name.padEnd(18)} 「${p.license}」`));
}