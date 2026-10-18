/**
 * 从投稿 Issue 生成收录 PR。
 *
 * 流程：
 *   1. 解析 Issue 正文（Issue Form 生成的固定结构）
 *   2. 调 GitHub API 拉取 star / 更新时间 / 协议 / Release 等客观数据
 *   3. 校验：仓库可访问、协议一致、分类合法、未被重复收录
 *   4. 校验通过 → 改写 projects.json → 开 PR
 *      校验失败 → 在 Issue 里留言说明原因
 *
 * 手动本地运行（调试用）：
 *   node tools/collect-submission.mjs <issue-number> --dry-run
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const REPO = process.env.GITHUB_REPOSITORY || "Daninelli/opensource-market";
const TOKEN = process.env.GITHUB_TOKEN || "";
const IS_DRY_RUN = process.argv.includes("--dry-run");

const API = "https://api.github.com";
const HEADERS = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opensource-market-collector"
};

/* --------------------------- 一级 / 二级分类映射 --------------------------- */
/* 名称来自 app.js 的 TAXONOMY；新增分类时两边同步 */
const TAXONOMY = {
    ecommerce: { label: "电商", children: { headless: "无头电商", storefront: "电商前端", platform: "平台商城" } },
    game: { label: "游戏", children: { engine: "游戏引擎", client: "游戏客户端" } },
    social: {
        label: "社交",
        children: { microblog: "微博客", im: "即时通讯", forum: "论坛社区", "collab-suite": "加密协作", calendar: "日历与日程" }
    },
    finance: {
        label: "金融",
        children: { "personal-finance": "个人财务", investment: "投资管理", accounting: "记账核算", payment: "支付网关" }
    },
    education: { label: "教育", children: { lms: "在线学习", interactive: "互动课程", lab: "实验与科研记录" } },
    medical: { label: "医疗", children: { emr: "电子病历", imaging: "医疗影像", practice: "诊所与实验室" } },
    enterprise: {
        label: "企业服务",
        children: {
            admin: "后台管理", "low-code": "低代码平台", bi: "数据分析", collaboration: "团队协作",
            crm: "客户关系", erp: "企业资源", docs: "文档与知识库"
        }
    },
    media: { label: "内容媒体", children: { cms: "建站与 CMS", streaming: "影音媒体", ebook: "电子书与阅读", podcast: "播客与音频" } },
    tool: {
        label: "工具",
        children: {
            design: "设计工具", notes: "笔记工具", photos: "相册管理", backend: "后端服务",
            automation: "自动化", monitoring: "运维监控", devtools: "开发工具", utility: "效率工具",
            security: "安全与密码", file: "文件管理与网盘", devops: "运维部署",
            readlater: "稍后读与收藏", iot: "物联网", "media-tool": "媒体处理"
        }
    },
    government: { label: "政务", children: { participation: "公众参与", "open-data": "开放数据" } },
    other: { label: "其他", children: { "smart-home": "智能家居", sync: "私有同步", system: "系统工具", documents: "文档归档" } }
};

/** 中文分类名 -> slug */
function slugify(label) {
    for (const [slug, meta] of Object.entries(TAXONOMY)) {
        if (meta.label === label) return slug;
    }
    return null;
}

function subSlug(primarySlug, subLabel) {
    const primary = TAXONOMY[primarySlug];
    if (!primary || !subLabel) return null;
    for (const [slug, label] of Object.entries(primary.children)) {
        if (label === subLabel) return slug;
    }
    return null;
}

/* ------------------------------ Issue 解析 ------------------------------ */

/** 解析 Issue Form 生成的 Markdown 正文 */
function parseIssueBody(body) {
    const fields = {};
    const pattern = /^###\s+(.+?)\s*\r?\n([\s\S]*?)(?=\r?\n###|\r?\n---|\s*$)/gm;
    let match;
    while ((match = pattern.exec(body))) {
        const key = match[1].trim();
        const value = (match[2] || "").trim();
        fields[key] = value.replace(/^_无响应_\s*$/, "").trim();
    }
    return fields;
}

/* ------------------------------ GitHub API ------------------------------ */

async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { ...HEADERS, ...(options.headers || {}) }
    });
    return response;
}

/** 拉取仓库客观信息 */
async function fetchRepoInfo(repo) {
    const out = { warnings: [] };

    const repoRes = await api(`/repos/${repo}`);
    if (!repoRes.ok) {
        out.error = repoRes.status === 404
            ? "仓库不存在，或不是公开仓库"
            : `GitHub API 返回 ${repoRes.status}`;
        return out;
    }
    const data = await repoRes.json();

    if (data.archived) out.warnings.push("该仓库已归档，可能不再维护");
    if (data.fork) out.warnings.push("这是一个 fork 仓库，请确认是否值得单独收录");
    if (!data.license) out.warnings.push("GitHub 未识别到 LICENSE 文件，请人工确认协议");
    if (data.stargazers_count < 20) out.warnings.push(`star 数仅 ${data.stargazers_count}，请确认项目是否成熟`);

    out.repo = {
        name: data.name,
        full_name: data.full_name,
        description: data.description || "",
        stars: data.stargazers_count,
        updated_at: data.pushed_at,
        default_branch: data.default_branch || "main",
        license: data.license ? data.license.spdx_id : null,
        language: data.language,
        topics: (data.topics || []).slice(0, 8),
        homepage: data.homepage || null
    };

    // 源码直链：用默认分支拼 codeload
    out.repo.download_url = `https://codeload.github.com/${data.full_name}/zip/refs/heads/${out.repo.default_branch}`;

    // 最新 Release
    const releaseRes = await api(`/repos/${repo}/releases/latest`);
    if (releaseRes.ok) {
        const release = await releaseRes.json();
        if (release && !release.draft) {
            out.release = {
                tag: release.tag_name,
                name: release.name || release.tag_name,
                published: release.published_at,
                url: release.html_url
            };
            const assets = Array.isArray(release.assets) ? release.assets : [];
            out.release.assets = assets
                .filter((asset) => /\.(exe|msi|dmg|appimage|deb|rpm|apk|zip|tar\.gz)$/i.test(asset.name))
                .slice(0, 12)
                .map((asset) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url }));
        }
    }

    // 安装包：同平台保留体积最大的那个
    if (out.release && out.release.assets.length) {
        const best = new Map();
        for (const asset of out.release.assets) {
            const key = asset.name.replace(/[-_.]?v?\d[\d.]*[-_.]?(x64|amd64|arm64|x86_64|universal)?/gi, "").toLowerCase();
            const exist = best.get(key);
            if (!exist || asset.size > exist.size) best.set(key, asset);
        }
        out.best_assets = [...best.values()].slice(0, 8);
        if (!out.best_assets.length) out.warnings.push("Release 里没有找到常见的安装包，「下载应用」按钮会置灰");
    }

    return out;
}

/* ------------------------------ 主流程 ------------------------------ */

async function main() {
    const issueNumber = process.argv.find((a) => /^\d+$/.test(a));
    if (!issueNumber) {
        console.error("用法：node tools/collect-submission.mjs <issue-number> [--dry-run]");
        process.exit(1);
    }

    if (!TOKEN && !IS_DRY_RUN) {
        console.error("缺少 GITHUB_TOKEN");
        process.exit(1);
    }

    console.log(`处理 issue #${issueNumber}`);

    // 1. 读 Issue
    const issueRes = await api(`/repos/${REPO}/issues/${issueNumber}`);
    if (!issueRes.ok) {
        console.error(`读取 Issue 失败：HTTP ${issueRes.status}`);
        process.exit(1);
    }
    const issue = await issueRes.json();
    const fields = parseIssueBody(issue.body || "");

    console.log("解析到的字段：");
    Object.entries(fields).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    // 2. 校验基础字段
    const errors = [];
    const repo = (fields["仓库地址"] || "").trim();
    const name = (fields["项目名称"] || "").trim();
    const categoryLabel = (fields["所属一级分类"] || "").trim();
    const subLabel = (fields["所属二级分类"] || "").trim();
    const note = (fields["一句话简介"] || "").trim();
    const techRaw = (fields["技术标签"] || "").trim();

    if (!repo) errors.push("缺少仓库地址");
    if (!name) errors.push("缺少项目名称");
    if (!note) errors.push("缺少一句话简介");
    if (note && note.length > 50) errors.push(`简介 ${note.length} 字，超过 50 字上限`);

    const primarySlug = slugify(categoryLabel);
    if (!primarySlug) errors.push(`无法识别的分类「${categoryLabel}」`);

    const secondarySlug = primarySlug ? subSlug(primarySlug, subLabel) : null;
    if (subLabel && !subLabel.startsWith("（") && !secondarySlug) {
        errors.push(`「${categoryLabel}」下没有二级分类「${subLabel}」`);
    }

    if (errors.length) {
        console.error("\n校验未通过：");
        errors.forEach((e) => console.error(`  - ${e}`));
        if (!IS_DRY_RUN) await commentOnIssue(issueNumber, renderFailReport(errors, [], null));
        process.exit(1);
    }

    // 3. 拉客观数据
    console.log("\n拉取 GitHub 数据…");
    const info = await fetchRepoInfo(repo);
    if (info.error) {
        console.error(`拉取失败：${info.error}`);
        if (!IS_DRY_RUN) await commentOnIssue(issueNumber, renderFailReport([info.error], [], null));
        process.exit(1);
    }

    // 4. 检查重复
    const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));
    const dupFull = projects.find((p) => p.repo === repo);
    const dupLower = projects.find((p) => (p.repo || "").toLowerCase() === repo.toLowerCase());
    if (dupFull || dupLower) {
        const dup = dupFull || dupLower;
        const message = `该仓库已被收录（${dup.name}）`;
        console.error(`重复：${message}`);
        if (!IS_DRY_RUN) {
            await commentOnIssue(issueNumber, renderFailReport([message], info.warnings, info.repo));
            await addLabels(issueNumber, ["重复"]);
            await removeLabels(issueNumber, ["待审核"]);
        }
        process.exit(1);
    }

    // 5. 组装项目对象
    const techStack = techRaw
        ? techRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 5)
        : info.repo.language ? [info.repo.language] : [];

    const project = {
        name,
        repo,
        category: categoryLabel,
        category_slug: primarySlug,
        subcategory: secondarySlug
            ? TAXONOMY[primarySlug].children[secondarySlug]
            : null,
        subcategory_slug: secondarySlug,
        tech_stack: techStack,
        deploy_type: "源码",
        note_zh: note,
        license: info.repo.license || "未识别",
        stars: info.repo.stars,
        updated_at: info.repo.updated_at,
        default_branch: info.repo.default_branch,
        download_url: info.repo.download_url,
        platform: "github",
        added_at: new Date().toISOString(),
        submitted_by: issue.user ? issue.user.login : "unknown"
    };
    if (info.release) project.release = info.release;
    if (info.best_assets) project.best_assets = info.best_assets;
    if (info.repo.homepage) project.homepage = info.repo.homepage;

    console.log("\n生成的项目数据：");
    console.log(JSON.stringify(project, null, 2));

    if (IS_DRY_RUN) {
        console.log("\n这是干跑，未做任何写入。");
        return;
    }

    // 6. 提交并开 PR
    projects.push(project);
    const sorted = projects.sort((a, b) => Date.parse(b.added_at || 0) - Date.parse(a.added_at || 0));
    await writeFile(join(root, "projects.json"), JSON.stringify(sorted, null, 2) + "\n", "utf8");

    execFileSync("git", ["add", "projects.json"], { cwd: root });
    execFileSync(
        "git",
        ["commit", "-m", `feat: 收录 ${name}（${repo}，来自 issue #${issueNumber}）`],
        { cwd: root, stdio: "inherit" }
    );

    const branch = `collect/${repo.replace("/", "-")}-${issueNumber}`;
    execFileSync("git", ["checkout", "-b", branch], { cwd: root, stdio: "inherit" });

    const prBody = renderPrBody(project, info, issueNumber, issue.user);
    const prUrl = execFileSync(
        "gh",
        ["pr", "create", "--title", `收录：${name}（${repo}）`, "--body", prBody],
        { cwd: root, encoding: "utf8" }
    ).trim();

    console.log(`\nPR 已创建：${prUrl}`);

    // 7. 回帖 + 打标签
    await commentOnIssue(
        issueNumber,
        `已自动创建收录 PR，请维护者审核后合并。\n\n${prUrl}\n\n合并后本 Issue 会自动关闭。`
    );
    await removeLabels(issueNumber, ["待审核"]);
    await addLabels(issueNumber, ["已生成 PR"]);
}

/* ------------------------------ Issue 交互 ------------------------------ */

async function addLabels(issueNumber, labels) {
    if (!TOKEN) return;
    await api(`/repos/${REPO}/issues/${issueNumber}/labels`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ labels })
    });
}

async function removeLabels(issueNumber, labels) {
    if (!TOKEN) return;
    for (const label of labels) {
        await api(`/repos/${REPO}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
            method: "DELETE"
        });
    }
}

async function commentOnIssue(issueNumber, text) {
    if (!TOKEN) {
        console.log(`\n[未发到 Issue 的内容]\n${text}`);
        return;
    }
    await api(`/repos/${REPO}/issues/${issueNumber}/comments`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text })
    });
}

/* ------------------------------ 报告渲染 ------------------------------ */

function renderPrBody(project, info, issueNumber, user) {
    const lines = [
        `来自投稿 issue #${issueNumber}`,
        "",
        "### 自动校验结果",
        "",
        `- ✅ 仓库可访问：\`${project.repo}\``,
        `- ✅ 未被重复收录`,
        `- ✅ 分类合法：${project.category}${project.subcategory ? " / " + project.subcategory : ""}`,
        `- ✅ 简介长度 ${project.note_zh.length} 字（上限 50）`,
        `- ${project.license === "未识别" ? "⚠️" : "✅"} 协议：${project.license}（从 LICENSE 自动读取）`
    ];
    if (info.best_assets && info.best_assets.length) {
        lines.push(`- ✅ 发现安装包 ${info.best_assets.length} 个，「下载应用」按钮可用`);
    } else {
        lines.push(`- ℹ️ 没有可用安装包，「下载应用」按钮会自动置灰`);
    }
    info.warnings.forEach((w) => lines.push(`- ⚠️ ${w}`));

    lines.push(
        "",
        "### 请维护者确认",
        "",
        `1. **分类是否合适**：${project.category} / ${project.subcategory || "（无二级分类）"}`,
        `2. **简介是否通顺**：${project.note_zh}`,
        `3. **技术标签**：${project.tech_stack.join("、") || "（空）"}`,
        "",
        "### 自动拉取的数据",
        "",
        `- Star：${project.stars}`,
        `- 最近推送：${project.updated_at}`,
        `- 默认分支：${project.default_branch}`,
        `- 主力语言：${info.repo.language || "未知"}`,
        project.release ? `- 最新 Release：${project.release.tag}` : "- 最新 Release：无",
        "",
        `投稿人：${user ? "@" + user.login : "匿名"}`,
        "",
        "---",
        "",
        "合并本 PR 即表示该项目已收录，issue 会随之关闭。",
        "由 `collect-submission.mjs` 自动创建。"
    );
    return lines.join("\n");
}

function renderFailReport(errors, warnings, repoInfo) {
    const lines = ["## ❌ 自动收录未通过", ""];
    lines.push("### 原因");
    errors.forEach((e) => lines.push(`- ${e}`));
    if (warnings.length) {
        lines.push("", "### 提示");
        warnings.forEach((w) => lines.push(`- ${w}`));
    }
    if (repoInfo) {
        lines.push(
            "",
            "### 已读取到的数据",
            `- Star：${repoInfo.stars}`,
            `- 最近推送：${repoInfo.updated_at}`,
            `- 协议：${repoInfo.license || "未识别"}`
        );
    }
    lines.push("", "修正后可以重新提交，或直接在该 Issue 中补充说明。");
    return lines.join("\n");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});