/**
 * 开源集市 · 前端渲染逻辑
 * 数据源：同目录下的 projects.json
 *
 * 页面结构：顶部一级分类导航（带滚动高亮） → 按一级分类分区的内容区，
 * 每个分区内部用二级分类小标签做筛选，全局还有一个搜索框。
 * 新增项目只需要编辑 projects.json，本文件通常无需改动。
 */
(function () {
    "use strict";

    var DATA_URL = "./projects.json";

    /**
     * 分类体系：一级 + 二级。
     * slug 用于数据匹配与筛选，label 用于展示，color 是分区配色。
     * 新增分类：在两处（app.js / tools/check-data.mjs）同步加一项即可。
     */
    var TAXONOMY = [
        {
            slug: "ecommerce", label: "电商", icon: "cart", color: "#15803d",
            blurb: "商城系统、无头电商与前端模板",
            children: [
                { slug: "headless", label: "无头电商" },
                { slug: "storefront", label: "电商前端" },
                { slug: "platform", label: "平台商城" }
            ]
        },
        {
            slug: "game", label: "游戏", icon: "gamepad", color: "#6d28d9",
            blurb: "游戏引擎与可玩的开源客户端",
            children: [
                { slug: "engine", label: "游戏引擎" },
                { slug: "client", label: "游戏客户端" }
            ]
        },
        {
            slug: "social", label: "社交", icon: "chat", color: "#0369a1",
            blurb: "论坛、微博客与即时通讯",
            children: [
                { slug: "microblog", label: "微博客" },
                { slug: "im", label: "即时通讯" },
                { slug: "forum", label: "论坛社区" }
            ]
        },
        {
            slug: "finance", label: "金融", icon: "money", color: "#b45309",
            blurb: "记账、预算与投资组合管理",
            children: [
                { slug: "personal-finance", label: "个人财务" },
                { slug: "investment", label: "投资管理" }
            ]
        },
        {
            slug: "education", label: "教育", icon: "cap", color: "#0e7490",
            blurb: "在线学习平台与互动课程工具",
            children: [
                { slug: "lms", label: "在线学习" },
                { slug: "interactive", label: "互动课程" }
            ]
        },
        {
            slug: "medical", label: "医疗", icon: "medical", color: "#be123c",
            blurb: "电子病历与诊所管理系统",
            children: [{ slug: "emr", label: "电子病历" }]
        },
        {
            slug: "enterprise", label: "企业服务", icon: "building", color: "#1d4ed8",
            blurb: "后台管理、低代码、数据分析与协作",
            children: [
                { slug: "admin", label: "后台管理" },
                { slug: "low-code", label: "低代码平台" },
                { slug: "bi", label: "数据分析" },
                { slug: "collaboration", label: "团队协作" }
            ]
        },
        {
            slug: "media", label: "内容媒体", icon: "media", color: "#be185d",
            blurb: "建站系统与影音媒体服务",
            children: [
                { slug: "cms", label: "建站与 CMS" },
                { slug: "streaming", label: "影音媒体" }
            ]
        },
        {
            slug: "tool", label: "工具", icon: "tool", color: "#334155",
            blurb: "设计、笔记、开发与自动化工具",
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
            slug: "government", label: "政务", icon: "landmark", color: "#57534e",
            blurb: "公众参与与开放数据平台",
            children: [
                { slug: "participation", label: "公众参与" },
                { slug: "open-data", label: "开放数据" }
            ]
        },
        {
            slug: "other", label: "其他", icon: "grid", color: "#64748b",
            blurb: "智能家居、文件同步与创作工具",
            children: [
                { slug: "smart-home", label: "智能家居" },
                { slug: "sync", label: "私有同步" },
                { slug: "system", label: "系统工具" },
                { slug: "documents", label: "文档归档" }
            ]
        }
    ];

    /** 每个分区的二级筛选状态：{ 一级slug: "all" | 二级slug } */
    var state = {
        projects: [],
        query: "",
        sub: {}
    };

    var els = { nav: null, app: null, status: null, search: null };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        els.nav = document.getElementById("nav");
        els.app = document.getElementById("app");
        els.status = document.getElementById("status");
        els.search = document.getElementById("search");

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
                bindSearch();
                renderAll();
                initScrollSpy();
                updateStats();
            })
            .catch(function (error) {
                console.error("加载数据失败:", error);
                els.app.innerHTML = "";
                els.app.appendChild(buildErrorPanel(error));
                els.status.textContent = "";
                if (els.nav) els.nav.innerHTML = "";
            });
    }

    /* ------------------------------ 搜索 ------------------------------ */

    function bindSearch() {
        if (!els.search) return;
        var timer = null;
        els.search.addEventListener("input", function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                state.query = els.search.value.trim().toLowerCase();
                renderAll();
            }, 120);
        });
        document.addEventListener("keydown", function (event) {
            var tag = (event.target && event.target.tagName) || "";
            if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
                event.preventDefault();
                els.search.focus();
            }
        });
    }

    function matchesQuery(project) {
        if (!state.query) return true;
        var haystack = [
            project.name,
            project.note_zh,
            project.repo,
            project.category,
            project.subcategory,
            project.license,
            project.deploy_type,
            (project.tech_stack || []).join(" ")
        ]
            .join(" ")
            .toLowerCase();
        return haystack.indexOf(state.query) !== -1;
    }

    /* ------------------------------ 分类解析 ------------------------------ */

    function findPrimary(slug) {
        return TAXONOMY.filter(function (item) { return item.slug === slug; })[0] || null;
    }

    function resolveCategory(project) {
        var meta = project.category_slug ? findPrimary(project.category_slug) : null;
        if (!meta && project.category) {
            meta = TAXONOMY.filter(function (item) {
                return item.label === project.category;
            })[0];
        }
        return meta || { slug: "other", label: project.category || "其他", icon: "grid", color: "#64748b", children: [] };
    }

    function resolveSubcategory(project, primary) {
        var children = primary.children || [];
        var sub = project.subcategory_slug
            ? children.filter(function (item) { return item.slug === project.subcategory_slug; })[0]
            : null;
        if (!sub && project.subcategory) {
            sub = children.filter(function (item) { return item.label === project.subcategory; })[0];
        }
        return sub || null;
    }

    /* ------------------------------ 渲染 ------------------------------ */

    /** 分组：按一级分类聚合，同时应用搜索与二级筛选 */
    function groupProjects() {
        var groups = TAXONOMY.map(function (primary) {
            var all = state.projects.filter(function (project) {
                return resolveCategory(project).slug === primary.slug;
            });
            var visible = all.filter(function (project) {
                if (!matchesQuery(project)) return false;
                var activeSub = state.sub[primary.slug] || "all";
                if (activeSub === "all") return true;
                var sub = resolveSubcategory(project, primary);
                return !!sub && sub.slug === activeSub;
            });
            return { primary: primary, all: all, visible: visible };
        });
        return groups.filter(function (group) {
            return group.visible.length > 0;
        });
    }

    function renderAll() {
        var groups = groupProjects();
        renderNav(groups);
        renderSections(groups);
        renderStatus(groups);
    }

    function renderNav(groups) {
        if (!els.nav) return;
        var counts = {};
        state.projects.forEach(function (project) {
            var slug = resolveCategory(project).slug;
            counts[slug] = (counts[slug] || 0) + 1;
        });

        var navHtml =
            '<a class="nav-link" href="#top" data-slug="__all__">' + iconMarkup("grid") + "全部" +
            '<span class="n">' + state.projects.length + "</span></a>" +
            TAXONOMY.filter(function (item) { return counts[item.slug]; })
                .map(function (item) {
                    return (
                        '<a class="nav-link" href="#sec-' + item.slug + '" data-slug="' +
                        escapeHtml(item.slug) + '">' + iconMarkup(item.icon) + escapeHtml(item.label) +
                        '<span class="n">' + (counts[item.slug] || 0) + "</span></a>"
                    );
                })
                .join("");

        els.nav.innerHTML = navHtml;
        requestAnimationFrame(updateNavMask);
    }

    function renderSections(groups) {
        els.app.innerHTML = "";
        if (!groups.length) {
            els.app.appendChild(buildEmptyState());
            return;
        }
        var fragment = document.createDocumentFragment();
        groups.forEach(function (group) {
            fragment.appendChild(buildSection(group));
        });
        els.app.appendChild(fragment);
    }

    function buildSection(group) {
        var primary = group.primary;
        var section = document.createElement("section");
        section.className = "section";
        section.id = "sec-" + primary.slug;

        /* 分区头：图标 + 标题 + 数量 */
        var head = document.createElement("div");
        head.className = "section-head";
        head.innerHTML =
            '<span class="section-icon" style="background:' + tint(primary.color, .12) + ";color:" + primary.color + '">' +
            iconMarkup(primary.icon) +
            "</span>" +
            '<div class="section-title">' +
            "<h2>" + escapeHtml(primary.label) + "</h2>" +
            "<p>" + escapeHtml(primary.blurb || "") + " · " + group.visible.length + " 个项目</p>" +
            "</div>";
        section.appendChild(head);

        /* 二级分类筛选行 */
        var subCounts = {};
        group.all.forEach(function (project) {
            var sub = resolveSubcategory(project, primary);
            if (sub) subCounts[sub.slug] = (subCounts[sub.slug] || 0) + 1;
        });

        var activeSub = state.sub[primary.slug] || "all";
        var hasSub = (primary.children || []).length > 0;
        if (hasSub) {
            var chips = document.createElement("div");
            chips.className = "subchips";

            chips.appendChild(
                buildSubChip(primary.slug, "all", "全部", group.visible.length, activeSub === "all")
            );
            primary.children.forEach(function (child) {
                if (!subCounts[child.slug]) return;
                chips.appendChild(
                    buildSubChip(primary.slug, child.slug, child.label, subCounts[child.slug], activeSub === child.slug)
                );
            });
            section.appendChild(chips);
        }

        /* 卡片网格 */
        var grid = document.createElement("div");
        grid.className = "grid";
        group.visible.forEach(function (project) {
            grid.appendChild(buildCard(project, primary));
        });
        bindPlatformPickers();
        section.appendChild(grid);

        return section;
    }

    function buildSubChip(primarySlug, subSlug, label, count, isActive) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (isActive ? " is-active" : "");
        chip.innerHTML = escapeHtml(label) + '<span class="n">' + count + "</span>";
        chip.addEventListener("click", function () {
            state.sub[primarySlug] = subSlug;
            renderAll();
        });
        return chip;
    }

    function buildCard(project, primary) {
        var card = document.createElement("article");
        card.className = "card";

        var sub = resolveSubcategory(project, primary);
        var tech = (Array.isArray(project.tech_stack) ? project.tech_stack : []).slice(0, 4);
        var tags = (sub ? '<span class="chip-tag sub">' + escapeHtml(sub.label) + "</span>" : "") +
            (project.deploy_type ? '<span class="chip-tag deploy">' + escapeHtml(project.deploy_type) + "</span>" : "") +
            tech.map(function (item) {
                return '<span class="chip-tag">' + escapeHtml(item) + "</span>";
            }).join("");

        /* 统计行：star 固定在第一位，更新时间紧随其后。
           两个槽位都固定占位，这样同行卡片的横线才对齐 */
        var starsCell =
            typeof project.stars === "number" && project.stars > 0
                ? '<span class="stat-item">' + iconMarkup("star") + formatCount(project.stars) + "</span>"
                : '<span class="stat-item is-empty">' + iconMarkup("star") + "0</span>";

        var timeCell = project.updated_at
            ? '<span class="stat-item">' + iconMarkup("clock") + relativeTime(project.updated_at) + "</span>"
            : '<span class="stat-item is-empty">' + iconMarkup("clock") + "更新时间待补充</span>";

        var stats = starsCell + timeCell;

        /* 源码 zip：codeload 直链 */
        var sourceUrl = project.download_url || (project.repo ? "https://github.com/" + project.repo : "");

        /* 安装包：从 Release 资产里挑出的候选包 */
        var assets = Array.isArray(project.best_assets) ? project.best_assets : [];

        /* 有多个包时才显示选择器，避免下拉只有一个选项显得多余 */
        var platformPicker = "";
        if (assets.length > 1) {
            var options = assets
                .map(function (asset) {
                    return (
                        '<option value="' + escapeHtml(asset.url) + '">' +
                        escapeHtml(asset.platform + " · " + asset.name + " · " + formatSize(asset.size)) +
                        "</option>"
                    );
                })
                .join("");
            // 收起时用紧凑的图标按钮，展开时由 CSS 给足宽度
            platformPicker =
                '<span class="dl-picker">' +
                '<span class="dl-picker-btn" title="切换安装包" aria-hidden="true">' +
                iconMarkup("caret") + "</span>" +
                '<select class="platform-select" aria-label="选择安装包" data-btn-for="' +
                escapeHtml(project.repo || "") + '">' + options + "</select>" +
                "</span>";
        }

        var repoUrl = project.repo ? "https://github.com/" + project.repo : "";
        var version = project.release ? project.release.tag : "";

        card.innerHTML =
            '<div class="card-top">' +
            "<div>" +
            // 协议标签与项目名同一行、靠右对齐
            '<div class="title-row">' +
            "<h3>" + escapeHtml(project.name || "未命名项目") + "</h3>" +
            '<span class="license" title="' + escapeHtml(project.license || "未知协议") + '">' +
            escapeHtml(project.license || "未知协议") + "</span>" +
            "</div>" +
            '<span class="repo">' + escapeHtml(project.repo || "") +
            (version ? ' <em class="ver">' + escapeHtml(version) + "</em>" : "") +
            "</span>" +
            "</div></div>" +
            '<p class="desc">' + escapeHtml(project.note_zh || "暂无简介") + "</p>" +
            '<div class="stats-row">' + stats + "</div>" +
            '<div class="tags">' + tags + "</div>" +
            '<div class="card-foot">' +
            '<div class="dl-group">' +
            platformPicker +
            (assets.length
                ? '<a class="btn btn-dl" href="' + escapeHtml(assets[0].url) +
                  '" target="_blank" rel="noopener noreferrer" data-dl-for="' +
                  escapeHtml(project.repo || "") + '">' +
                  iconMarkup("package") + '<span class="btn-label">下载应用</span>' +
                  '<span class="dl-size">' + escapeHtml(formatSize(assets[0].size)) + "</span></a>"
                // 没有官方编译包：按钮置灰不可点，提示只能自行构建
                : '<span class="btn btn-dl is-disabled" aria-disabled="true" title="该项目未提供官方编译包，请从源码自行构建或用 Docker 部署">' +
                  iconMarkup("package") + '<span class="btn-label">下载应用</span>' +
                  '<span class="dl-size">无官方包</span></span>') +
            (sourceUrl
                ? '<a class="btn btn-src" href="' + escapeHtml(sourceUrl) +
                  '" target="_blank" rel="noopener noreferrer">' +
                  iconMarkup("download") + "下载源码</a>"
                : "") +
            (repoUrl
                ? '<a class="repo-link" href="' + escapeHtml(repoUrl) +
                  '" target="_blank" rel="noopener noreferrer" title="在 GitHub 打开仓库">GitHub</a>'
                : "") +
            "</div></div>";

        return card;
    }

    /** 切换安装包选择器时，更新「下载应用」的链接与体积 */
    function bindPlatformPickers() {
        Array.prototype.forEach.call(
            document.querySelectorAll(".platform-select"),
            function (select) {
                select.addEventListener("change", function () {
                    var repo = select.getAttribute("data-btn-for");
                    var button = document.querySelector('.btn-dl[data-dl-for="' + repo + '"]');
                    if (!button) return;
                    button.setAttribute("href", select.value);

                    // 从选项文本里取出体积更新到按钮上
                    var option = select.options[select.selectedIndex];
                    var sizeNode = button.querySelector(".dl-size");
                    if (sizeNode && option) {
                        var match = /\s·\s([\d.]+\s(?:KB|MB|GB))$/.exec(option.textContent);
                        if (match) sizeNode.textContent = match[1];
                    }
                });
            }
        );
    }

    /** 字节数 -> 人类可读体积 */
    function formatSize(bytes) {
        if (!bytes) return "";
        var mb = bytes / 1048576;
        if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
        if (mb >= 1) return mb.toFixed(mb >= 100 ? 0 : 1) + " MB";
        return Math.max(1, Math.round(bytes / 1024)) + " KB";
    }

    /** 12345 -> 12.3k */
    function formatCount(n) {
        if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
        return String(n);
    }

    /** ISO 时间 -> 相对时间（刚刚 / 3 天前 / 2 个月前 ...） */
    function relativeTime(iso) {
        var then = new Date(iso).getTime();
        if (!then) return "";
        var diff = Date.now() - then;
        var min = 60 * 1000, hour = 60 * min, day = 24 * hour, month = 30 * day, year = 365 * day;
        if (diff < min) return "刚刚";
        if (diff < hour) return Math.floor(diff / min) + " 分钟前";
        if (diff < day) return Math.floor(diff / hour) + " 小时前";
        if (diff < month) return Math.floor(diff / day) + " 天前";
        if (diff < year) return Math.floor(diff / month) + " 个月前";
        return Math.floor(diff / year) + " 年前";
    }

    function renderStatus(groups) {
        if (!els.status) return;
        var total = state.projects.length;
        var shown = groups.reduce(function (sum, group) { return sum + group.visible.length; }, 0);

        if (state.query) {
            els.status.textContent = "搜索「" + state.query + "」，命中 " + shown + " 个项目（共 " + total + " 个）";
        } else if (groups.length === 1) {
            els.status.textContent = "分类：[" + groups[0].primary.label + "]" + " · " + shown + " 个项目（共 " + total + " 个）";
        } else {
            els.status.textContent = "共收录 " + total + " 个开源项目，点上方分类可以快速定位。";
        }
    }

    /** 空间够就取消右侧渐隐，不够则保留滑动提示 */
    function updateNavMask() {
        if (!els.nav) return;
        var overflowing = els.nav.scrollWidth > els.nav.clientWidth + 1;
        els.nav.classList.toggle("is-fit", !overflowing);
    }

    /* ------------------------------ 滚动高亮 ------------------------------ */

    function initScrollSpy() {
        var links = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));

        links.forEach(function (link) {
            link.addEventListener("click", function (event) {
                event.preventDefault();
                var slug = link.getAttribute("data-slug");
                if (slug === "__all__") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                }
                var target = document.getElementById("sec-" + slug);
                if (target) {
                    window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 76, behavior: "smooth" });
                }
            });
        });

        function onScroll() {
            var current = null;
            var allLink = null;
            if (window.pageYOffset <= 120) {
                allLink = links.filter(function (link) {
                    return link.getAttribute("data-slug") === "__all__";
                })[0];
            }
            links.forEach(function (link) {
                if (link.getAttribute("data-slug") === "__all__") return;
                var section = document.getElementById("sec-" + link.getAttribute("data-slug"));
                if (section && section.getBoundingClientRect().top <= 90) {
                    current = link;
                }
            });
            links.forEach(function (link) { link.classList.remove("is-active"); });
            var toHighlight = current || allLink;
            if (toHighlight) {
                toHighlight.classList.add("is-active");
                keepInView(toHighlight);
            }
        }

        /** 横向滑动时，把当前高亮的分类滚到可见位置 */
        function keepInView(link) {
            var nav = els.nav;
            if (!nav) return;
            var left = link.offsetLeft;
            var right = left + link.offsetWidth;
            if (left < nav.scrollLeft) {
                nav.scrollLeft = left - 12;
            } else if (right > nav.scrollLeft + nav.clientWidth) {
                nav.scrollLeft = right - nav.clientWidth + 12;
            }
        }

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", updateNavMask, { passive: true });
        onScroll();
    }

    /* ------------------------------ 统计 / 空态 / 错误 ------------------------------ */

    function updateStats() {
        var primaryCount = new Set(state.projects.map(function (project) {
            return resolveCategory(project).slug;
        })).size;
        var subSet = {};
        state.projects.forEach(function (project) {
            var primary = resolveCategory(project);
            var sub = resolveSubcategory(project, primary);
            if (sub) subSet[primary.slug + "/" + sub.slug] = true;
        });

        setText("stat-projects", state.projects.length);
        setText("stat-primary", primaryCount);
        setText("stat-sub", Object.keys(subSet).length);
        setText("stat-download", state.projects.filter(function (project) {
            return !!(project.download_url || project.repo);
        }).length);
    }

    function setText(id, value) {
        var node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function buildEmptyState() {
        var box = document.createElement("div");
        box.className = "empty";
        box.innerHTML = "<p>没有符合条件的项目。</p>";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "清除搜索与筛选";
        btn.addEventListener("click", function () {
            state.query = "";
            state.sub = {};
            if (els.search) els.search.value = "";
            renderAll();
        });
        box.appendChild(btn);
        return box;
    }

    function buildErrorPanel(error) {
        var panel = document.createElement("div");
        panel.className = "error";

        var isFileProtocol = typeof location !== "undefined" && location.protocol === "file:";

        if (isFileProtocol) {
            panel.innerHTML =
                "<h2>数据没有加载出来：浏览器禁止本地文件读取 projects.json</h2>" +
                "<p>你是直接双击打开的 <code>index.html</code>（地址栏是 <code>file://</code>）。" +
                "浏览器出于安全策略，不允许页面用 fetch 读取同目录的 JSON 文件，所以这里是空的。" +
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
                "<pre>" + escapeHtml(String(error && error.message ? error.message : error)) + "</pre>";
        }

        return panel;
    }

    /* ------------------------------ 工具 ------------------------------ */

    /** 给分类主色调一个浅色底，用作图标方块背景 */
    function tint(hex, alpha) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
        if (!m) return "#f3f4f6";
        return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + alpha + ")";
    }

    /** 引用 index.html 里的图标精灵：<use href="#icon-xxx"> */
    function iconMarkup(name) {
        return '<svg class="icon" aria-hidden="true" focusable="false"><use href="#icon-' + escapeHtml(name) + '"></use></svg>';
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();