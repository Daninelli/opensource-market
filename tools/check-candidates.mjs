/**
 * projects-candidates.json 候选池自检脚本。
 *
 * 用法（在项目根目录）：
 *   node tools/check-candidates.mjs
 *
 * 检查内容：
 *   1. JSON 是否合法、最外层是否为数组
 *   2. 必填字段是否齐全（字段定义见 DATA-FORMAT.md）
 *   3. platform 与 gitee_* 字段是否自洽（github / gitee / both）
 *   4. repo 格式是否为 owner/repo，候选内部是否有重复
 *   5. 与 projects.json 是否重复（重复的会在合并时自动跳过，这里只提示）
 *   6. license 是否仍未确认（UNKNOWN / NOASSERTION）
 * 最后输出各分类候选数量与平台分布。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 字段规范见 DATA-FORMAT.md 第 3 / 5 节 */
const REQUIRED = [
    "name",
    "repo",
    "category",
    "category_slug",
    "subcategory",
    "subcategory_slug",
    "tech_stack",
    "deploy_type",
    "note_zh",
    "license",
    "platform"
];

const problems = [];

const readJson = async (name) => JSON.parse(await readFile(join(root, name), "utf8"));

let candidates;
try {
    candidates = await readJson("projects-candidates.json");
} catch (error) {
    if (error.code === "ENOENT") {
        console.error("[ERROR] 找不到 projects-candidates.json");
        process.exit(1);
    }
    console.error("[ERROR] projects-candidates.json 不是合法 JSON：", error.message);
    process.exit(1);
}

if (!Array.isArray(candidates)) {
    console.error("[ERROR] projects-candidates.json 最外层必须是数组 []");
    process.exit(1);
}

let projects = [];
try {
    projects = await readJson("projects.json");
} catch {
    // 没有 projects.json 也能单独检查候选池
}
const existingRepos = new Set(projects.map((p) => String(p.repo || "").toLowerCase()));

const seen = new Map();
const duplicates = [];

candidates.forEach((item, index) => {
    const tag = `[#${index + 1} ${item.name || "?"}]`;

    REQUIRED.forEach((field) => {
        const value = item[field];
        const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
        if (empty) problems.push(`${tag} 缺少字段 ${field}`);
    });

    if (item.repo && !/^[\w.-]+\/[\w.-]+$/.test(item.repo)) {
        problems.push(`${tag} repo 格式应为 owner/repo，当前是 ${item.repo}`);
    }

    const platform = item.platform;
    if (platform === "gitee") {
        if (!item.gitee_repo) problems.push(`${tag} platform=gitee 但缺 gitee_repo`);
        if (!item.gitee_url) problems.push(`${tag} platform=gitee 但缺 gitee_url`);
        if (typeof item.stars === "number" && typeof item.gitee_stars !== "number") {
            problems.push(`${tag} 纯 Gitee 项目的 star 应写在 gitee_stars，不要写 stars`);
        }
    } else if (platform === "both") {
        if (!item.gitee_repo || !item.gitee_url) problems.push(`${tag} platform=both 但缺 gitee_repo / gitee_url`);
    } else if (platform === "github") {
        if (item.gitee_repo || item.gitee_url) problems.push(`${tag} platform=github 却带了 gitee 字段`);
    } else if (platform) {
        problems.push(`${tag} platform 只能是 github / gitee / both，当前是 ${platform}`);
    }

    if (item.license === "UNKNOWN" || item.license === "NOASSERTION") {
        problems.push(`${tag} license 尚未确认（${item.license}）`);
    }

    const key = String(item.repo || "").toLowerCase();
    if (seen.has(key)) {
        problems.push(`${tag} 与 #${seen.get(key) + 1} 仓库重复：${item.repo}`);
    } else {
        seen.set(key, index);
    }

    if (existingRepos.has(key)) {
        duplicates.push(item);
    }
});

const byCategory = {};
for (const item of candidates) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
}

console.log(`\n候选总数：${candidates.length}`);
console.log("平台分布：", {
    github: candidates.filter((x) => x.platform === "github").length,
    both: candidates.filter((x) => x.platform === "both").length,
    gitee: candidates.filter((x) => x.platform === "gitee").length
});

console.log("\n分类分布：");
Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, count]) => console.log(`  ${label}：${count}`));

if (duplicates.length) {
    console.log(`\n提示：以下 ${duplicates.length} 个已在 projects.json 中，合并时会自动跳过：`);
    duplicates.forEach((d) => console.log(`  - ${d.name}（${d.repo}）`));
}

if (problems.length) {
    console.error(`\n[ERROR] 发现 ${problems.length} 个问题：`);
    problems.forEach((p) => console.error("  - " + p));
    process.exit(1);
}

console.log("\n[OK] 候选池检查通过");
