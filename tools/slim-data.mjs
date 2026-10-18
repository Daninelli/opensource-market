/**
 * 精简 projects.json 的体积。
 *
 * 问题：release.assets 存了 Release 的全量资产列表（含 FreeBSD、
 * 校验文件、源码包等），单条平均 2.8KB。页面上根本不读这份数据——
 * 下载下拉用的是 best_assets，而 release 只用到 tag 来显示版本号。
 * 按 1 万个项目估算，光这个字段就要占 27MB。
 *
 * 处理：
 *   1. release 只保留 tag / name / published / url，删掉 assets
 *   2. best_assets 每项只保留 name / size / url（页面用到的三个字段）
 *   3. 剔除所有 null 字段，减少传输冗余
 *
 * 用法：node tools/slim-data.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const dataPath = "projects.json";
const projects = JSON.parse(readFileSync(dataPath, "utf8"));

let savedRelease = 0;
let savedAssets = 0;
let nullRemoved = 0;

const KEEP_RELEASE = ["tag", "name", "published", "url"];
const KEEP_ASSET = ["name", "size", "url"];

const slimmed = projects.map((project) => {
    const out = {};

    // release：只留元信息，去掉全量 assets
    if (project.release && typeof project.release === "object") {
        const release = {};
        for (const key of KEEP_RELEASE) {
            if (project.release[key] !== undefined && project.release[key] !== null) {
                release[key] = project.release[key];
            }
        }
        if (project.release.assets && Array.isArray(project.release.assets)) {
            savedRelease +=
                JSON.stringify(project.release).length - JSON.stringify(release).length;
        }
        if (Object.keys(release).length) out.release = release;
    }

    // best_assets：只保留页面用到的三个字段
    if (Array.isArray(project.best_assets) && project.best_assets.length) {
        const assets = project.best_assets.map((asset) => {
            const kept = {};
            for (const key of KEEP_ASSET) {
                if (asset[key] !== undefined && asset[key] !== null) kept[key] = asset[key];
            }
            const before = JSON.stringify(asset).length;
            const after = JSON.stringify(kept).length;
            savedAssets += before - after;
            return kept;
        });
        out.best_assets = assets;
    }

    // 其余字段原样搬过来，跳过 null / undefined
    for (const [key, value] of Object.entries(project)) {
        if (key === "release" || key === "best_assets") continue;
        if (value === null || value === undefined) {
            nullRemoved += 1;
            continue;
        }
        out[key] = value;
    }

    return out;
});

const before = JSON.stringify(projects).length;
const after = JSON.stringify(slimmed).length;

console.log(`release 去冗余：省 ${(savedRelease / 1024).toFixed(1)}KB`);
console.log(`best_assets 去冗余：省 ${(savedAssets / 1024).toFixed(1)}KB`);
console.log(`剔除 null 字段：${nullRemoved} 处`);
console.log("");
console.log(`体积 ${(before / 1024).toFixed(1)}KB -> ${(after / 1024).toFixed(1)}KB（省 ${(100 - (after / before) * 100).toFixed(1)}%）`);

// 按 1 万项目线性外推
const perItem = after / slimmed.length;
console.log(`按 1 万项目外推：约 ${((perItem * 10000) / 1048576).toFixed(2)}MB（未压缩）`);

if (DRY) {
    console.log("\n这是干跑，未写入。去掉 --dry-run 才会真正写入。");
} else {
    writeFileSync(dataPath, JSON.stringify(slimmed, null, 2) + "\n", "utf8");
    console.log("\n已写入 projects.json");
}