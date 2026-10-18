/**
 * 用 git 历史回填 projects.json 的 added_at（首次进入数据文件的时间）。
 *
 * 背景：「最近收录」页面需要知道每个项目是哪天被收录的，但早期数据
 * 没有这个字段。这里从 git log 里查每个项目首次出现在 projects.json
 * 中的提交时间，按出现顺序倒序推断具体日期。
 *
 * 用法：node tools/backfill-added-at.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DRY = process.argv.includes("--dry-run");
const dataPath = "projects.json";
const projects = JSON.parse(readFileSync(dataPath, "utf8"));

/** 列出所有修改过 projects.json 的提交：时间 + 作者 */
function commitsForData() {
    const out = execFileSync(
        "git",
        ["log", "--format=%H|%cI|%an", "--follow", "--", dataPath],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    return out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [sha, date, author] = line.split("|");
            return { sha, date, author };
        })
        .reverse(); // 从最早到最新
}

console.log(`projects.json 历史提交：${commitsForData().length} 次`);

// 逐个提交查看该版本包含的 repo 集合，新出现的 repo 即为该次提交收录
const commits = commitsForData();
const seen = new Set();
const firstSeen = new Map(); // repo -> ISO 时间

for (const commit of commits) {
    let content = "";
    try {
        content = execFileSync("git", ["show", `${commit.sha}:${dataPath}`], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024
        });
    } catch {
        continue; // 该提交里还没有这个文件
    }

    let list;
    try {
        list = JSON.parse(content);
    } catch {
        continue;
    }
    if (!Array.isArray(list)) continue;

    for (const project of list) {
        if (!project || !project.repo) continue;
        if (seen.has(project.repo)) continue;
        seen.add(project.repo);
        firstSeen.set(project.repo, commit.date);
    }
    process.stdout.write(".");
}
process.stdout.write("\n");

let filled = 0;
let missing = [];
const earliest = commits.length ? commits[0].date : new Date().toISOString();

for (const project of projects) {
    if (project.added_at) continue;
    const iso = firstSeen.get(project.repo);
    if (iso) {
        project.added_at = iso;
        filled += 1;
    } else {
        missing.push(project.name);
        project.added_at = earliest; // 兜底：归到最早一次提交
    }
}

// 按首次收录时间排序，让 json 本身也保持时间顺序
projects.sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));

// 保持字段顺序：added_at 放在 license 之后
const ORDER = [
    "name", "repo", "category", "category_slug", "subcategory", "subcategory_slug",
    "tech_stack", "deploy_type", "note_zh", "license", "added_at",
    "stars", "updated_at", "default_branch", "download_url", "platform",
    "gitee_repo", "gitee_url", "gitee_stars", "gitee_updated_at", "github_mirror", "mirror_note",
    "pinned", "pin_label", "pin_note", "pin_until"
];

const reordered = projects.map((project) => {
    const ordered = {};
    for (const key of ORDER) {
        if (project[key] !== undefined) ordered[key] = project[key];
    }
    for (const key of Object.keys(project)) {
        if (ordered[key] === undefined) ordered[key] = project[key];
    }
    return ordered;
});

console.log(`\n回填 added_at：${filled} 个`);
if (missing.length) {
    console.log(`未在 git 历史中找到（已归到最早提交）：${missing.length} 个`);
    console.log(`  ${missing.slice(0, 10).join("、")}${missing.length > 10 ? " ..." : ""}`);
}

// 统计最近 7 天
const weekAgo = Date.now() - 7 * 86400000;
const recent = reordered.filter((p) => new Date(p.added_at || 0).getTime() >= weekAgo);
console.log(`\n最近 7 天收录：${recent.length} 个`);

if (DRY) {
    console.log("\n这是干跑，未写入。去掉 --dry-run 才会真正写入。");
} else {
    writeFileSync(dataPath, JSON.stringify(reordered, null, 2) + "\n", "utf8");
    console.log("\n已写入 projects.json");
}