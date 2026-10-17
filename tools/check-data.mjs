/**
 * projects.json 数据自检脚本
 *
 * 用法（在本目录下）：
 *   node tools/check-data.mjs
 *
 * 检查内容：
 *   1. JSON 是否合法、最外层是否为数组
 *   2. 必填字段是否齐全、类型是否正确
 *   3. 一级分类 / 二级分类的 slug 是否都在 app.js 的分类体系里
 *   4. repo 格式是否为 owner/repo，是否有重复项目
 * 最后输出各分类的项目数量统计。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = ["name", "repo", "category", "category_slug", "tech_stack", "deploy_type", "note_zh", "license"];

/** 与 app.js 中的 TAXONOMY 保持一致 */
const TAXONOMY = {
    ecommerce: { label: "电商", children: { headless: "无头电商", storefront: "电商前端", platform: "平台商城" } },
    game: { label: "游戏", children: { engine: "游戏引擎", client: "游戏客户端" } },
    social: { label: "社交", children: { microblog: "微博客", im: "即时通讯", forum: "论坛社区" } },
    finance: { label: "金融", children: { "personal-finance": "个人财务", investment: "投资管理" } },
    education: { label: "教育", children: { lms: "在线学习", interactive: "互动课程" } },
    medical: { label: "医疗", children: { emr: "电子病历" } },
    enterprise: {
        label: "企业服务",
        children: { admin: "后台管理", "low-code": "低代码平台", bi: "数据分析", collaboration: "团队协作" }
    },
    media: { label: "内容媒体", children: { cms: "建站与 CMS", streaming: "影音媒体" } },
    tool: {
        label: "工具",
        children: {
            design: "设计工具",
            notes: "笔记工具",
            photos: "相册管理",
            backend: "后端服务",
            automation: "自动化",
            monitoring: "运维监控",
            devtools: "开发工具",
            utility: "效率工具"
        }
    },
    government: { label: "政务", children: { participation: "公众参与", "open-data": "开放数据" } },
    other: {
        label: "其他",
        children: { "smart-home": "智能家居", sync: "私有同步", system: "系统工具", documents: "文档归档" }
    }
};

const problems = [];

function fail(index, name, message) {
    problems.push(`[#${index + 1} ${name || "?"}] ${message}`);
}

const raw = await readFile(join(root, "projects.json"), "utf8");
let projects;
try {
    projects = JSON.parse(raw);
} catch (error) {
    console.error("[ERROR] projects.json 不是合法 JSON：", error.message);
    process.exit(1);
}

if (!Array.isArray(projects)) {
    console.error("[ERROR] projects.json 最外层必须是数组 []");
    process.exit(1);
}

const seenRepos = new Map();
const primaryCount = {};
const subCount = {};

projects.forEach((project, index) => {
    const name = project.name;
    REQUIRED.forEach((field) => {
        const value = project[field];
        const empty = value === undefined || value === null || value === "";
        if (empty) fail(index, name, `缺少字段 ${field}`);
    });
    if (!Array.isArray(project.tech_stack)) fail(index, name, "tech_stack 必须是字符串数组");

    if (project.repo) {
        if (!/^[\w.-]+\/[\w.-]+$/.test(project.repo)) {
            fail(index, name, `repo 格式应为 owner/repo，当前是 ${project.repo}`);
        }
        if (seenRepos.has(project.repo)) {
            fail(index, name, `仓库重复，已在 #${seenRepos.get(project.repo) + 1} 出现过`);
        } else {
            seenRepos.set(project.repo, index);
        }
    }

    const primary = TAXONOMY[project.category_slug];
    if (!primary) {
        fail(index, name, `未知的一级分类 slug：${project.category_slug}`);
        return;
    }
    if (project.category !== primary.label) {
        fail(index, name, `category 与 slug 不一致：应为「${primary.label}」，实际「${project.category}」`);
    }
    primaryCount[project.category_slug] = (primaryCount[project.category_slug] || 0) + 1;

    if (project.subcategory_slug) {
        const subLabel = primary.children[project.subcategory_slug];
        if (!subLabel) {
            fail(index, name, `「${primary.label}」下没有二级分类 slug：${project.subcategory_slug}`);
        } else {
            if (project.subcategory !== subLabel) {
                fail(index, name, `subcategory 与 slug 不一致：应为「${subLabel}」，实际「${project.subcategory}」`);
            }
            subCount[project.category_slug] = subCount[project.category_slug] || {};
            subCount[project.category_slug][project.subcategory_slug] =
                (subCount[project.category_slug][project.subcategory_slug] || 0) + 1;
        }
    }
});

console.log(`\n项目总数：${projects.length}`);
console.log("\n分类分布：");
Object.entries(TAXONOMY).forEach(([slug, meta]) => {
    const total = primaryCount[slug] || 0;
    if (!total) return;
    console.log(`  ${meta.label}（${slug}）：${total}`);
    Object.entries(subCount[slug] || {}).forEach(([subSlug, count]) => {
        console.log(`    └─ ${meta.children[subSlug]}（${subSlug}）：${count}`);
    });
});

if (problems.length) {
    console.error(`\n[ERROR] 发现 ${problems.length} 个问题：`);
    problems.forEach((item) => console.error("  - " + item));
    process.exit(1);
}

console.log("\n[OK] 数据检查通过");
