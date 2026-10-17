/**
 * 开源集市 · 前端渲染逻辑
 * 数据源：同目录下的 projects.json
 *
 * 分类是两级结构：
 *   一级分类（category_slug）→ 二级分类（subcategory_slug）
 * 新增项目时只需要编辑 projects.json，本文件通常无需改动。
 */
(function () {
    "use strict";

    var DATA_URL = "./projects.json";

    /**
     * 分类体系：一级 + 二级。
     * slug 用于数据匹配与筛选，label 用于展示，顺序即筛选栏的展示顺序。
     * 新增分类时在这里加一项，再在 projects.json 里用对应 slug 引用即可。
     */
    var TAXONOMY = [
        {
            slug: "ecommerce",
            label: "电商",
            children: [
                { slug: "headless", label: "无头电商" },
                { slug: "storefront", label: "电商前端" },
                { slug: "platform", label: "平台商城" }
            ]
        },
        {
            slug: "game",
            label: "游戏",
            children: [
                { slug: "engine", label: "游戏引擎" },
                { slug: "client", label: "游戏客户端" }
            ]
        },
        {
            slug: "social",
            label: "社交",
            children: [
                { slug: "microblog", label: "微博客" },
                { slug: "im", label: "即时通讯" },
                { slug: "forum", label: "论坛社区" }
            ]
        },
        {
            slug: "finance",
            label: "金融",
            children: [
                { slug: "personal-finance", label: "个人财务" },
                { slug: "investment", label: "投资管理" }
            ]
        },
        {
            slug: "education",
            label: "教育",
            children: [
                { slug: "lms", label: "在线学习" },
                { slug: "interactive", label: "互动课程" }
            ]
        },
        {
            slug: "medical",
            label: "医疗",
            children: [{ slug: "emr", label: "电子病历" }]
        },
        {
            slug: "enterprise",
            label: "企业服务",
            children: [
                { slug: "admin", label: "后台管理" },
                { slug: "low-code", label: "低代码平台" },
                { slug: "bi", label: "数据分析" },
                { slug: "collaboration", label: "团队协作" }
            ]
        },
        {
            slug: "media",
            label: "内容媒体",
            children: [
                { slug: "cms", label: "建站与 CMS" },
                { slug: "streaming", label: "影音媒体" }
            ]
        },
        {
            slug: "tool",
            label: "工具",
            children: [
                { slug: "design", label: "设计工具" },
                { slug: "notes", label: "笔记工具" },
                { slug: "photos", label: "相册管理" },
                { slug: "backend", label: "后端服务" },
                { slug: "automation", label: "自动化" },
                { slug: "monitoring", label: "运维监控" },
                { slug: "devtools", label: "开发工具" },
                { slug: "utility", label: "效率工具" }
            ]
        },
        {
            slug: "government",
            label: "政务",
            children: [
                { slug: "participation", label: "公众参与" },
                { slug: "open-data", label: "开放数据" }
            ]
        },
        {
            slug: "other",
            label: "其他",
            children: []
        }
    ];

    var state = {
        projects: [],
        activeSlug: "all",
        activeSub: "all"
    };

    var els = { grid: null, filters: null, subfilters: null, status: null };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        els.grid = document.getElementById("app");
        els.filters = document.getElementById("filters");
        els.subfilters = document.getElementById("subfilters");
        els.status = document.getElementById("status");
        if (!els.grid) return;

        fetch(DATA_URL, { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("请求 projects.json 失败：HTTP " + response.status);
                }
                return response.json();
            })
            .then(function (projects) {
                if (!Array.isArray(projects)) {
                    throw new Error("projects.json 的最外层必须是一个数组 []");
                }
                state.projects = projects;
                renderPrimaryFilters();
                applyFilter("all", "all");
            })
            .catch(function (error) {
                console.error("加载数据失败:", error);
                els.grid.innerHTML = "";
                els.grid.appendChild(buildErrorPanel(error));
                if (els.filters) els.filters.innerHTML = "";
                if (els.subfilters) els.subfilters.innerHTML = "";
                if (els.status) els.status.textContent = "";
            });
    }

    /* --------------------------- 分类解析 --------------------------- */

    function findPrimary(slug) {
        return (
            TAXONOMY.filter(function (item) {
                return item.slug === slug;
            })[0] || null
        );
    }

    /** 兼容只写中文、或写了未知 slug 的数据：落到「其他」 */
    function resolveCategory(project) {
        var meta = project.category_slug ? findPrimary(project.category_slug) : null;
        if (!meta && project.category) {
            meta = TAXONOMY.filter(function (item) {
                return item.label === project.category;
            })[0];
        }
        return meta || { slug: "other", label: project.category || "其他", children: [] };
    }

    function resolveSubcategory(project, primary) {
        var children = primary.children || [];
        var sub = project.subcategory_slug
            ? children.filter(function (item) {
                  return item.slug === project.subcategory_slug;
              })[0]
            : null;
        if (!sub && project.subcategory) {
            sub = children.filter(function (item) {
                return item.label === project.subcategory;
            })[0];
        }
        return sub || null;
    }

    function countByPrimary(projects) {
        var counts = {};
        projects.forEach(function (project) {
            var slug = resolveCategory(project).slug;
            counts[slug] = (counts[slug] || 0) + 1;
        });
        return counts;
    }

    function countBySub(projects, primarySlug) {
        var counts = {};
        projects.forEach(function (project) {
            var primary = resolveCategory(project);
            if (primary.slug !== primarySlug) return;
            var sub = resolveSubcategory(project, primary);
            if (!sub) return;
            counts[sub.slug] = (counts[sub.slug] || 0) + 1;
        });
        return counts;
    }

    /* --------------------------- 一级筛选栏 --------------------------- */

    function renderPrimaryFilters() {
        if (!els.filters) return;
        var counts = countByPrimary(state.projects);
        els.filters.innerHTML = "";

        var options = [{ slug: "all", label: "全部", count: state.projects.length }];
        TAXONOMY.forEach(function (item) {
            if (counts[item.slug]) {
                options.push({ slug: item.slug, label: item.label, count: counts[item.slug] });
            }
        });

        options.forEach(function (option) {
            els.filters.appendChild(
                buildFilterButton(option, "primary", option.slug === state.activeSlug, function () {
                    applyFilter(option.slug, "all");
                })
            );
        });
    }

    /* --------------------------- 二级筛选栏 --------------------------- */

    function renderSubFilters() {
        if (!els.subfilters) return;
        els.subfilters.innerHTML = "";

        var primary = state.activeSlug === "all" ? null : findPrimary(state.activeSlug);
        var children = primary ? primary.children || [] : [];

        if (!primary || !children.length) {
            els.subfilters.hidden = true;
            return;
        }

        var counts = countBySub(state.projects, primary.slug);
        var total = countByPrimary(state.projects)[primary.slug] || 0;

        els.subfilters.hidden = false;
        els.subfilters.appendChild(
            buildFilterButton(
                { slug: "all", label: "全部" + primary.label, count: total },
                "sub",
                state.activeSub === "all",
                function () {
                    applyFilter(primary.slug, "all");
                }
            )
        );

        children.forEach(function (child) {
            if (!counts[child.slug]) return;
            els.subfilters.appendChild(
                buildFilterButton(
                    { slug: child.slug, label: child.label, count: counts[child.slug] },
                    "sub",
                    state.activeSub === child.slug,
                    function () {
                        applyFilter(primary.slug, child.slug);
                    }
                )
            );
        });
    }

    function buildFilterButton(option, level, isActive, onClick) {
        var button = document.createElement("button");
        button.type = "button";
        button.className =
            "filter-btn " + (level === "sub" ? "filter-btn--sub" : "filter-btn--primary") +
            (isActive ? " is-active" : "");
        button.setAttribute("data-level", level);
        button.setAttribute("data-slug", option.slug);
        button.setAttribute("aria-pressed", String(isActive));
        button.innerHTML =
            escapeHtml(option.label) + '<span class="filter-count">' + option.count + "</span>";
        button.addEventListener("click", onClick);
        return button;
    }

    /* --------------------------- 应用筛选 --------------------------- */

    function applyFilter(primarySlug, subSlug) {
        state.activeSlug = primarySlug;
        state.activeSub = subSlug || "all";

        syncButtons("primary", primarySlug);
        renderSubFilters();
        syncButtons("sub", state.activeSub);

        var visible = state.projects.filter(function (project) {
            var primary = resolveCategory(project);
            if (primarySlug !== "all" && primary.slug !== primarySlug) return false;
            if (state.activeSub === "all") return true;
            var sub = resolveSubcategory(project, primary);
            return !!sub && sub.slug === state.activeSub;
        });

        renderGrid(visible);
        updateStatus(visible);
    }

    function syncButtons(level, activeSlug) {
        var buttons = document.querySelectorAll('.filter-btn[data-level="' + level + '"]');
        Array.prototype.forEach.call(buttons, function (button) {
            var isActive = button.getAttribute("data-slug") === activeSlug;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    }

    function updateStatus(visible) {
        if (!els.status) return;
        var total = state.projects.length;
        var parts = [];

        if (state.activeSlug === "all") {
            parts.push("共收录 " + total + " 个开源项目 · 点分类筛选，点按钮直达仓库");
        } else {
            var primary = findPrimary(state.activeSlug);
            var label = primary ? primary.label : state.activeSlug;
            if (state.activeSub !== "all") {
                var child = (primary.children || []).filter(function (item) {
                    return item.slug === state.activeSub;
                })[0];
                if (child) label += " / " + child.label;
            }
            parts.push(
                "当前分类：" + label + " · " + visible.length + " 个项目（共 " + total + " 个）"
            );
        }

        els.status.textContent = parts.join(" ");
    }

    /* --------------------------- 卡片渲染 --------------------------- */

    function renderGrid(projects) {
        els.grid.innerHTML = "";
        if (!projects.length) {
            var empty = document.createElement("p");
            empty.className = "placeholder";
            empty.textContent = "这个分类下还没有收录项目，去 projects.json 里加一个吧。";
            els.grid.appendChild(empty);
            return;
        }
        var fragment = document.createDocumentFragment();
        projects.forEach(function (project) {
            fragment.appendChild(buildCard(project));
        });
        els.grid.appendChild(fragment);
    }

    function buildCard(project) {
        var card = document.createElement("div");
        card.className = "card";

        var primary = resolveCategory(project);
        var sub = resolveSubcategory(project, primary);
        var techStack = Array.isArray(project.tech_stack) ? project.tech_stack : [];

        var tagsHtml =
            '<span class="tag category">' + escapeHtml(primary.label) + "</span>" +
            (sub ? '<span class="tag subcategory">' + escapeHtml(sub.label) + "</span>" : "") +
            (project.deploy_type
                ? '<span class="tag deploy">' + escapeHtml(project.deploy_type) + "</span>"
                : "") +
            techStack
                .map(function (tech) {
                    return '<span class="tag">' + escapeHtml(tech) + "</span>";
                })
                .join("");

        var repoUrl = project.repo ? "https://github.com/" + project.repo : "";
        var demoUrl = project.demo_url || "";

        card.innerHTML =
            "<h3>" + escapeHtml(project.name || "未命名项目") + "</h3>" +
            '<div class="tags">' + tagsHtml + "</div>" +
            '<div class="desc">' + escapeHtml(project.note_zh || "暂无简介") + "</div>" +
            '<div class="meta">' +
            "<strong>协议：</strong>" + escapeHtml(project.license || "未知") + " &nbsp;|&nbsp; " +
            "<strong>仓库：</strong><code>" + escapeHtml(project.repo || "-") + "</code>" +
            "</div>" +
            '<div class="actions">' +
            (repoUrl
                ? '<a class="btn" href="' + escapeHtml(repoUrl) + '" target="_blank" rel="noopener noreferrer">去 GitHub 下载</a>'
                : "") +
            (demoUrl
                ? '<a class="btn btn-demo" href="' + escapeHtml(demoUrl) + '" target="_blank" rel="noopener noreferrer">在线演示</a>'
                : "") +
            "</div>";

        return card;
    }

    /* --------------------------- 错误提示 --------------------------- */

    function buildErrorPanel(error) {
        var panel = document.createElement("div");
        panel.className = "error";

        var isFileProtocol =
            typeof location !== "undefined" && location.protocol === "file:";

        if (isFileProtocol) {
            panel.innerHTML =
                "<h2>数据没有加载出来：浏览器禁止本地文件读取 projects.json</h2>" +
                "<p>你是直接双击打开的 <code>index.html</code>（地址栏是 <code>file://</code>）。" +
                "浏览器出于安全策略，不允许页面用 fetch 读取同目录的 JSON 文件，所以卡片区域是空的。" +
                "文件本身没有问题，换一种打开方式即可。</p>" +
                "<p><strong>方式一：起一个本地静态服务器（推荐，任选一条）</strong></p>" +
                "<pre>python -m http.server 8000\n# 然后浏览器访问 http://localhost:8000</pre>" +
                "<pre>npx serve .</pre>" +
                "<p><strong>方式二：</strong>用 VS Code 打开这个文件夹，安装 Live Server 插件，" +
                "右键 <code>index.html</code> → Open with Live Server。</p>" +
                "<p><strong>方式三：</strong>直接推到 GitHub 并开启 Pages，" +
                "线上地址会自动以 https 提供，页面就能正常渲染了。</p>";
        } else {
            panel.innerHTML =
                "<h2>数据加载失败</h2>" +
                "<p>请检查 <code>projects.json</code> 是否存在，以及 JSON 格式是否合法" +
                "（常见问题：多写了逗号、用了中文引号、括号没闭合）。</p>" +
                "<pre>" + escapeHtml(String(error && error.message ? error.message : error)) + "</pre>" +
                "<p>提示：可以在 VS Code 里打开 projects.json，出现红色波浪线的地方就是语法错误。</p>";
        }

        return panel;
    }

    /* --------------------------- 工具函数 --------------------------- */

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
