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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = ["name", "repo", "category", "category_slug", "tech_stack", "deploy_type", "note_zh", "license"];

/** 形态（kind）枚举：与分类正交的「交付形态」维度（app 为默认，可不填） */
const VALID_KIND = new Set(["app", "client", "cli", "framework", "library", "skill"]);

/** 与 app.js 中的 TAXONOMY 保持一致 */
const TAXONOMY = {
    ecommerce: { label: "电商", children: { headless: "无头电商", storefront: "电商前端", platform: "平台商城" } },
    game: { label: "游戏", children: { engine: "游戏引擎", client: "游戏客户端" } },
    social: {
        label: "社交",
        children: {
            microblog: "微博客",
            im: "即时通讯",
            forum: "论坛社区",
            "collab-suite": "加密协作",
            calendar: "日历与日程"
        }
    },
    finance: {
        label: "金融",
        children: {
            "personal-finance": "个人财务",
            investment: "投资管理",
            accounting: "记账核算",
            payment: "支付网关"
        }
    },
    education: {
        label: "教育",
        children: { lms: "在线学习", interactive: "互动课程", lab: "实验与科研记录" }
    },
    medical: {
        label: "医健",
        children: { emr: "电子病历", imaging: "医疗影像", practice: "诊所与实验室", health: "健康管理" }
    },
    enterprise: {
        label: "企业服务",
        children: {
            admin: "后台管理",
            "low-code": "低代码平台",
            bi: "数据分析",
            collaboration: "团队协作",
            crm: "客户关系",
            erp: "企业资源",
            docs: "文档与知识库",
            hr: "人力资源",
            asset: "资产管理",
            office: "办公套件"
        }
    },
    media: {
        label: "内容媒体",
        children: {
            cms: "建站与 CMS",
            streaming: "影音媒体",
            ebook: "电子书与阅读",
            podcast: "播客与音频"
        }
    },
    tool: {
        label: "工具",
        children: {
            agent: "智能体",
            devtools: "开发工具",
            utility: "效率工具",
            automation: "自动化",
            monitoring: "运维监控",
            design: "设计工具",
            notes: "笔记工具",
            photos: "相册管理",
            backend: "后端服务",
            security: "安全与密码",
            file: "文件管理与网盘",
            devops: "运维部署",
            readlater: "稍后读与收藏",
            iot: "物联网",
            "media-tool": "媒体处理",
            engineering: "工程制造",
            download: "下载工具"
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
let pinnedCount = 0;
const pinnedNames = [];
const MAX_PINNED = 5;

projects.forEach((project, index) => {
    const name = project.name;
    REQUIRED.forEach((field) => {
        const value = project[field];
        const empty = value === undefined || value === null || value === "";
        if (empty) fail(index, name, `缺少字段 ${field}`);
    });
    if (!Array.isArray(project.tech_stack)) fail(index, name, "tech_stack 必须是字符串数组");

    /* 形态字段：可选；填了必须在枚举内 */
    if (project.kind !== undefined && !VALID_KIND.has(project.kind)) {
        fail(index, name, `kind 只能是 app/client/cli/framework/library/skill，当前是 ${project.kind}`);
    }

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

    /* 平台字段：github / gitee / both，缺省视为 github */
    const platform = project.platform || "github";
    if (!["github", "gitee", "both"].includes(platform)) {
        fail(index, name, `platform 只能是 github / gitee / both，当前是 ${platform}`);
    }
    if (platform === "gitee" || platform === "both") {
        if (!project.gitee_repo && !project.gitee_url) {
            fail(index, name, `platform 为 ${platform} 时必须提供 gitee_repo 或 gitee_url`);
        }
        if (project.gitee_repo && !/^[\w.-]+\/[\w.-]+$/.test(project.gitee_repo)) {
            fail(index, name, `gitee_repo 格式应为 owner/repo，当前是 ${project.gitee_repo}`);
        }
    }
    if (platform === "github" || platform === "both") {
        if (!project.repo) fail(index, name, `platform 为 ${platform} 时必须提供 repo`);
    }

    /* 置顶字段：可选，但填了就必须合规 */
    if (project.pinned === true) {
        pinnedCount += 1;
        pinnedNames.push(name);
        if (project.pin_until !== undefined) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(project.pin_until))) {
                fail(index, name, `pin_until 应为 YYYY-MM-DD，实际 ${project.pin_until}`);
            }
        }
        if (project.pin_label && String(project.pin_label).length > 6) {
            fail(index, name, `pin_label 最多 6 字，当前 ${String(project.pin_label).length} 字`);
        }
        if (project.pin_note && String(project.pin_note).length > 40) {
            fail(index, name, `pin_note 最多 40 字，当前 ${String(project.pin_note).length} 字`);
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
console.log(`置顶项目：${pinnedCount} 个${pinnedNames.length ? "（" + pinnedNames.join("、") + "）" : ""}`);
if (pinnedCount > MAX_PINNED) {
    console.error(`[ERROR] 置顶项目超过 ${MAX_PINNED} 个，请先撤掉一些：${pinnedNames.join("、")}`);
    process.exit(1);
}
console.log("\n分类分布：");
Object.entries(TAXONOMY).forEach(([slug, meta]) => {
    const total = primaryCount[slug] || 0;
    if (!total) return;
    console.log(`  ${meta.label}（${slug}）：${total}`);
    Object.entries(subCount[slug] || {}).forEach(([subSlug, count]) => {
        console.log(`    └─ ${meta.children[subSlug]}（${subSlug}）：${count}`);
    });
});

/* 形态（kind）分布：未标记的按 app 统计 */
const kindCount = { app: 0, client: 0, cli: 0, framework: 0, library: 0, skill: 0 };
let missingKind = 0;
projects.forEach((p) => {
    if (!p.kind) {
        missingKind += 1;
        kindCount.app += 1;
        return;
    }
    kindCount[p.kind] = (kindCount[p.kind] || 0) + 1;
});
console.log("\n形态分布（kind）：");
Object.entries(kindCount).forEach(([k, v]) => {
    if (v) console.log(`  ${k}：${v}`);
});
if (missingKind) {
    console.log(`[WARN] 有 ${missingKind} 个项目未标记 kind（按 app 统计），建议补全。`);
}

/* 简介长度提示：卡片上简介固定两行，实测约 50 字以内可放下 */
const LONG_DESC = 50;
const longDesc = projects.filter((p) => (p.note_zh || "").length > LONG_DESC);
if (longDesc.length) {
    console.log(`\n[WARN] 有 ${longDesc.length} 条简介超过 ${LONG_DESC} 字，窄屏可能超出两行：`);
    longDesc.slice(0, 10).forEach((p) => {
        console.log(`  - ${p.name}（${p.note_zh.length} 字）`);
    });
    if (longDesc.length > 10) console.log(`  ... 另有 ${longDesc.length - 10} 条`);
}

/* 标签数量提示：卡片上标签最多两行，超过 6 个容易放不下 */
const manyTags = projects.filter(
    (p) =>
        1 +
        (p.deploy_type ? 1 : 0) +
        (Array.isArray(p.tech_stack) ? p.tech_stack.length : 0) +
        (p.kind && p.kind !== "app" ? 1 : 0) >
        6
);
if (manyTags.length) {
    console.log(`\n[WARN] 有 ${manyTags.length} 个项目标签超过 6 个，窄屏可能超出两行：`);
    manyTags.slice(0, 10).forEach((p) => console.log(`  - ${p.name}`));
}

/* 协议分类检查：license_category 由 classify-licenses.mjs 生成，必须存在且合法 */
const VALID_CATEGORY = new Set(["open", "restricted", "unknown"]);
const missingCategory = projects.filter((p) => !VALID_CATEGORY.has(p.license_category));
if (missingCategory.length) {
    problems.push(
        `有 ${missingCategory.length} 个项目缺少合法的 license_category` +
            `（${missingCategory.slice(0, 3).map((p) => p.name).join("、")}…），请运行 node tools/classify-licenses.mjs`
    );
}

/* 非开源协议统计：这类项目会在页面上自动标注，数量变化值得留意 */
const restrictedProjects = projects.filter((p) => p.license_category === "restricted");
if (restrictedProjects.length) {
    console.log(`\n[INFO] 非 OSI 开源协议项目 ${restrictedProjects.length} 个（页面自动标注「非开源」）：`);
    restrictedProjects
        .sort((a, b) => (b.stars || 0) - (a.stars || 0))
        .slice(0, 10)
        .forEach((p) => console.log(`  - ${p.name}（${p.license}）`));
}

/* 未能归类的协议：不是错误，但应该被看见，可能是新协议或 GitHub 识别错误 */
const unknownLicense = projects.filter((p) => p.license_category === "unknown");
if (unknownLicense.length) {
    console.log(`\n[WARN] 有 ${unknownLicense.length} 个项目的协议不属于常见软件开源协议，页面会提示用户自行确认：`);
    unknownLicense.forEach((p) => console.log(`  - ${p.name}（${p.license}）→ ${p.repo}`));
}

/**
 * 派生文件的一致性检查。
 *
 * 页面上的「监控 N 个项目」这类数字只有一个来源：projects.json。
 * 如果生成的 changes-feed.json 是旧的，页面就会显示过期数字，
 * 所以这里直接比对，对不上就报错，逼着重新生成。
 */
try {
    const feed = JSON.parse(readFileSync(join(root, "data", "changes-feed.json"), "utf8"));
    const expected = projects.filter((p) => p.repo).length;
    if (feed.monitored !== expected) {
        problems.push(
            `data/changes-feed.json 的 monitored=${feed.monitored} 与 projects.json 的 ${expected} 不一致，` +
                `请运行 node tools/build-changes-feed.mjs`
        );
    }
} catch {
    problems.push("缺少 data/changes-feed.json，请运行 node tools/build-changes-feed.mjs");
}

if (problems.length) {
    console.error(`\n[ERROR] 发现 ${problems.length} 个问题：`);
    problems.forEach((item) => console.error("  - " + item));
    process.exit(1);
}

console.log("\n[OK] 数据检查通过");
