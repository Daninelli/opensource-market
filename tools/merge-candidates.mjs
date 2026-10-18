/**
 * 把 projects-candidates.json（候选池）合并进 projects.json 的辅助脚本。
 *
 * 背景：候选池是人工审核后的待录入项目，字段形态与 projects.json 一致
 * （字段规范见 DATA-FORMAT.md）。本脚本只做「追加 + 去重 + 补默认字段」，
 * 不覆盖已有项目，不做自动分类推断。
 *
 * 用法（在项目根目录）：
 *   node tools/merge-candidates.mjs            # 干跑，只打印将会发生什么
 *   node tools/merge-candidates.mjs --write    # 真正写入 projects.json
 *
 * 安全性：
 *   - 按 repo 去重，已存在的仓库直接跳过（不会重复收录）
 *   - 只补默认字段，不改动候选数据里已有的值
 *   - 写入前自动备份 projects.json 到 projects.backup-<时间戳>.json
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "projects.json");
const candidatePath = join(root, "projects-candidates.json");
const WRITE = process.argv.includes("--write");

/** 一级 / 二级分类中文名，与 app.js / tools/check-data.mjs 保持一致 */
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
        label: "医疗",
        children: { emr: "电子病历", imaging: "医疗影像", practice: "诊所与实验室" }
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
            docs: "文档与知识库"
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
            design: "设计工具",
            notes: "笔记工具",
            photos: "相册管理",
            backend: "后端服务",
            automation: "自动化",
            monitoring: "运维监控",
            devtools: "开发工具",
            utility: "效率工具",
            security: "安全与密码",
            file: "文件管理与网盘",
            devops: "运维部署",
            readlater: "稍后读与收藏",
            iot: "物联网",
            "media-tool": "媒体处理"
        }
    },
    government: { label: "政务", children: { participation: "公众参与", "open-data": "开放数据" } },
    other: {
        label: "其他",
        children: { "smart-home": "智能家居", sync: "私有同步", system: "系统工具", documents: "文档归档" }
    }
};

const problems = [];

function normalise(project, index) {
    const label = `[#${index + 1} ${project.name || "?"}]`;
    const out = { ...project };

    // 平台字段默认值：老数据没有 platform 时按 github 处理
    if (!out.platform) out.platform = "github";

    // Gitee 相关字段默认 null，保证所有项目字段结构一致
    out.gitee_repo = out.gitee_repo ?? null;
    out.gitee_url = out.gitee_url ?? null;
    out.gitee_stars = out.gitee_stars ?? null;
    out.gitee_updated_at = out.gitee_updated_at ?? null;
    out.github_mirror = out.github_mirror ?? null;

    // 分类中文名兜底：slug 对得上就自动补，避免手写中英文不一致导致 check-data 报错
    const primary = TAXONOMY[out.category_slug];
    if (!primary) {
        problems.push(`${label} 未知一级分类 slug：${out.category_slug}`);
        return out;
    }
    if (!out.category) out.category = primary.label;

    if (out.subcategory_slug) {
        const subLabel = primary.children[out.subcategory_slug];
        if (!subLabel) {
            problems.push(`${label} 「${primary.label}」下没有二级分类 slug：${out.subcategory_slug}`);
        } else if (!out.subcategory) {
            out.subcategory = subLabel;
        }
    }

    // 排序键：双平台取两边较大 star
    if (typeof out.stars !== "number") {
        out.stars = typeof out.gitee_stars === "number" ? out.gitee_stars : null;
    }

    return out;
}

const projects = JSON.parse(await readFile(dataPath, "utf8"));
let candidates;
try {
    candidates = JSON.parse(await readFile(candidatePath, "utf8"));
} catch (error) {
    if (error.code === "ENOENT") {
        console.error("[ERROR] 找不到 projects-candidates.json，先准备候选池数据。");
        process.exit(1);
    }
    throw error;
}

if (!Array.isArray(candidates)) {
    console.error("[ERROR] projects-candidates.json 最外层必须是数组。");
    process.exit(1);
}

const existing = new Map(projects.map((p) => [p.repo, p]));
const seenInBatch = new Set();

const added = [];
const skipped = [];
const rejected = [];

candidates.forEach((raw, index) => {
    const project = normalise(raw, index);

    if (problems.some((p) => p.startsWith(`[#${index + 1} `))) {
        rejected.push(project);
        return;
    }
    if (!project.repo) {
        problems.push(`[#${index + 1} ${project.name || "?"}] 缺少 repo`);
        rejected.push(project);
        return;
    }
    if (existing.has(project.repo)) {
        skipped.push({ project, reason: "已收录" });
        return;
    }
    // Gitee 项目如果同时是已有 GitHub 仓库的镜像，也按重复处理
    if (project.gitee_repo && existing.has(project.gitee_repo)) {
        skipped.push({ project, reason: `Gitee 仓库 ${project.gitee_repo} 已收录` });
        return;
    }
    if (seenInBatch.has(project.repo)) {
        skipped.push({ project, reason: "候选池内部重复" });
        return;
    }

    seenInBatch.add(project.repo);
    added.push(project);
});

console.log(`\n候选池：${candidates.length} 个项目`);
console.log(`  · 可新增：${added.length}`);
console.log(`  · 已收录跳过：${skipped.length}`);
console.log(`  · 字段有问题被拒：${rejected.length}`);

if (skipped.length) {
    console.log("\n跳过明细：");
    skipped.forEach((s) => console.log(`  - ${s.project.name}（${s.project.repo}）→ ${s.reason}`));
}

if (rejected.length) {
    console.log("\n被拒明细：");
    rejected.forEach((p) => console.log(`  - ${p.name}（${p.repo}）`));
}

if (problems.length) {
    console.error("\n[ERROR] 候选数据存在以下问题：");
    problems.forEach((item) => console.error("  - " + item));
    process.exit(1);
}

if (!added.length) {
    console.log("\n没有可新增的项目，未改动 projects.json。");
    process.exit(0);
}

console.log("\n将会新增：");
added.forEach((p) => console.log(`  + ${p.name}（${p.repo}）· ${p.category} / ${p.subcategory || "未分子类"}`));

if (!WRITE) {
    console.log("\n这是干跑。确认无误后加 --write 真正写入。");
    process.exit(0);
}

// 备份后写入
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
const backupPath = join(root, `projects.backup-${stamp}.json`);
await copyFile(dataPath, backupPath);
await writeFile(dataPath, JSON.stringify([...projects, ...added], null, 2) + "\n", "utf8");

console.log(`\n已备份原文件到 ${backupPath.split(/[\\/]/).pop()}`);
console.log(`projects.json 现有 ${projects.length + added.length} 个项目。`);
console.log("请接着运行 node tools/check-data.mjs 做最终校验。");
