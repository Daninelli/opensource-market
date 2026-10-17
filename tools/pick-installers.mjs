/**
 * 从 Release 资产里挑出「用户真正会装的包」，过滤掉校验和、签名、SBOM、源码包等噪声。
 *
 * 用法：
 *   node tools/pick-installers.mjs
 *
 * 写入 projects.json 每个项目的 best_assets 字段（按推荐顺序排好的安装包）。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "projects.json");
const projects = JSON.parse(await readFile(dataPath, "utf8"));

/** 明显不是安装包的文件 */
const NOISE = [
    /checksum/i, /sha\d+/i, /\.asc$/i, /\.sig$/i, /\.md5$/i, /\.sha512$/i, /\.blockmap$/i,
    /\.zsync$/i, /\.sbom/i, /sbom-/i, /^vex\./i, /^compat\.json$/i, /third_party_licenses/i,
    /\.sha256sum$/i, /\.sha1sum$/i, /^\s*$/, /^changelog/i, /\.txt$/i, /\.json$/i,
    /\.xml$/i, /\.pdf$/i, /debug_symbols/i, /-source\./i, /schema\.graphql$/i, /\.sha256$/i,
    // 调试/开发中间产物，不是给用户装的
    /debug/i, /\.aar$/i, /\.spk$/i, /\.snap$/i, /\.aab$/i, /symbols/i, /sources\.jar$/i
];

/** 平台识别与优先级：数字越小越优先展示（桌面平台优先于移动端） */
const PLATFORM_RULES = [
    // macOS 必须放在 Windows 之前判断：darwin/mac 命中的名字里常常也带 win 之类的字样
    { key: "ios", label: "iOS", re: /\.ipa$/i, rank: 3 },
    { key: "android", label: "Android", re: /android|\.apk$/i, rank: 4 },
    { key: "mac", label: "macOS", re: /darwin|macos|mac[-_]|\.dmg$|\.pkg$/i, rank: 1 },
    { key: "win", label: "Windows", re: /win|windows|\.exe$|\.msi$|\.appx$/i, rank: 1 },
    { key: "linux", label: "Linux", re: /linux|\.deb$|\.rpm$|\.appimage$|\.flatpak$/i, rank: 2 },
    { key: "all", label: "通用", re: /\.tar\.gz$|\.war$|\.jar$|\.zip$|\.tar\.xz$|\.xz$/i, rank: 5 }
];

function isNoise(name) {
    return NOISE.some((re) => re.test(name));
}

function classify(name) {
    for (const rule of PLATFORM_RULES) {
        if (rule.re.test(name)) return rule;
    }
    return { key: "other", label: "其他平台", rank: 5 };
}

let cleaned = 0;
let dropped = 0;

for (const project of projects) {
    if (!project.release || !project.release.assets) {
        delete project.best_assets;
        continue;
    }

    const picked = [];
    for (const asset of project.release.assets) {
        if (isNoise(asset.name)) {
            dropped += 1;
            continue;
        }
        // 体积过小的（<100KB）多半不是完整安装包
        if (asset.size && asset.size < 100 * 1024) {
            dropped += 1;
            continue;
        }
        const rule = classify(asset.name);
        // 企业版 / 特殊变体降权，避免排在社区版前面
        let penalty = 0;
        if (/enterprise/i.test(asset.name)) penalty += 10;
        picked.push({
            name: asset.name,
            size: asset.size,
            url: asset.url,
            platform: rule.label,
            platformKey: rule.key,
            rank: rule.rank + penalty
        });
    }

    // 按平台优先级 + 同平台按体积从小到大（优先给体积适中的主包）
    picked.sort((a, b) => (a.rank - b.rank) || (a.size - b.size));

    // 每个平台最多保留 2 个候选，避免卡片塞太长
    const perPlatform = {};
    const best = [];
    for (const item of picked) {
        const n = perPlatform[item.platformKey] || 0;
        if (n >= 2) continue;
        perPlatform[item.platformKey] = n + 1;
        best.push({
            name: item.name,
            size: item.size,
            url: item.url,
            platform: item.platform
        });
    }

    if (best.length) {
        project.best_assets = best;
        cleaned += 1;
    } else {
        delete project.best_assets;
    }
}

await writeFile(dataPath, JSON.stringify(projects, null, 2) + "\n", "utf8");

console.log(`整理完成：${cleaned} 个项目有可用安装包，过滤掉 ${dropped} 个噪声文件`);
console.log("");
for (const project of projects.filter((p) => p.best_assets)) {
    console.log(`${project.name} [${project.release.tag}] -> ${project.best_assets.length} 个候选`);
    project.best_assets.forEach((a) => {
        console.log(`   ${a.platform.padEnd(9)} ${(a.size / 1048576).toFixed(1).padStart(7)} MB  ${a.name}`);
    });
}