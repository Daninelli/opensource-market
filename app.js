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
            blurb: "论坛、微博客、即时通讯与加密协作",
            children: [
                { slug: "microblog", label: "微博客" },
                { slug: "im", label: "即时通讯" },
                { slug: "forum", label: "论坛社区" },
                { slug: "collab-suite", label: "加密协作" },
                { slug: "calendar", label: "日历与日程" }
            ]
        },
        {
            slug: "finance", label: "金融", icon: "money", color: "#b45309",
            blurb: "记账、预算、开票与投资组合管理",
            children: [
                { slug: "personal-finance", label: "个人财务" },
                { slug: "investment", label: "投资管理" },
                { slug: "accounting", label: "记账核算" },
                { slug: "payment", label: "支付网关" }
            ]
        },
        {
            slug: "education", label: "教育", icon: "cap", color: "#0e7490",
            blurb: "在线学习平台与互动课程工具",
            children: [
                { slug: "lms", label: "在线学习" },
                { slug: "interactive", label: "互动课程" },
                { slug: "lab", label: "实验与科研记录" }
            ]
        },
        {
            slug: "medical", label: "医疗", icon: "medical", color: "#be123c",
            blurb: "电子病历、影像与诊所管理系统",
            children: [
                { slug: "emr", label: "电子病历" },
                { slug: "imaging", label: "医疗影像" },
                { slug: "practice", label: "诊所与实验室" }
            ]
        },
        {
            slug: "enterprise", label: "企业服务", icon: "building", color: "#1d4ed8",
            blurb: "后台管理、低代码、数据分析与协作",
            children: [
                { slug: "admin", label: "后台管理" },
                { slug: "low-code", label: "低代码平台" },
                { slug: "bi", label: "数据分析" },
                { slug: "collaboration", label: "团队协作" },
                { slug: "crm", label: "客户关系" },
                { slug: "erp", label: "企业资源" },
                { slug: "docs", label: "文档与知识库" }
            ]
        },
        {
            slug: "media", label: "内容媒体", icon: "media", color: "#be185d",
            blurb: "建站系统、影音媒体与阅读",
            children: [
                { slug: "cms", label: "建站与 CMS" },
                { slug: "streaming", label: "影音媒体" },
                { slug: "ebook", label: "电子书与阅读" },
                { slug: "podcast", label: "播客与音频" }
            ]
        },
        {
            slug: "tool", label: "工具", icon: "tool", color: "#334155",
            blurb: "设计、笔记、安全、运维与自动化工具",
            children: [
                { slug: "design", label: "设计工具" },
                { slug: "notes", label: "笔记工具" },
                { slug: "photos", label: "相册管理" },
                { slug: "backend", label: "后端服务" },
                { slug: "automation", label: "自动化" },
                { slug: "monitoring", label: "运维监控" },
                { slug: "devtools", label: "开发工具" },
                { slug: "utility", label: "效率工具" },
                { slug: "security", label: "安全与密码" },
                { slug: "file", label: "文件管理与网盘" },
                { slug: "devops", label: "运维部署" },
                { slug: "readlater", label: "稍后读与收藏" },
                { slug: "iot", label: "物联网" },
                { slug: "media-tool", label: "媒体处理" }
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
                // 排序兜底用的随机值：每次打开页面固定一次，重排时不会乱跳
                projects.forEach(function (project) {
                    project._rand = Math.random();
                });
                bindSearch();
                bindPickerDismiss();
                bindNavJump();
                renderAll();
                renderTrending();
                initScrollSpy();
                updateStats();
                loadMeta();
            })
            .catch(function (error) {
                console.error("加载数据失败:", error);
                els.app.innerHTML = "";
                els.app.appendChild(buildErrorPanel(error));
                els.status.textContent = "";
                els.status.hidden = true;
                if (els.nav) els.nav.innerHTML = "";
            });
    }

    /* ------------------------------ 搜索 ------------------------------ */

    /** 点分类导航时，先把目标分区填好再跳，避免跳到空骨架 */
    function bindNavJump() {
        if (!els.nav) return;
        els.nav.addEventListener("click", function (event) {
            var link = event.target.closest ? event.target.closest("a[href^='#sec-']") : null;
            if (!link) return;
            var target = document.querySelector(link.getAttribute("href"));
            if (target) fillSection(target);
        });
    }

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

    /** 置顶是否生效：没有过期日期，或过期日期还没到 */
    function isPinActive(project) {
        if (project.pinned !== true) return false;
        if (!project.pin_until) return true;
        var until = Date.parse(project.pin_until + "T23:59:59");
        if (isNaN(until)) return true;
        return Date.now() <= until;
    }

    /** 分组：按一级分类聚合，同时应用搜索与二级筛选 */
    /** 分类内排序：置顶优先 → star 降序 → 最近更新 → 随机兜底 */
    function compareProjects(a, b) {
        var pinA = isPinActive(a);
        var pinB = isPinActive(b);
        if (pinA !== pinB) return pinA ? -1 : 1;

        var starsA = typeof a.stars === "number" ? a.stars : -1;
        var starsB = typeof b.stars === "number" ? b.stars : -1;
        if (starsB !== starsA) return starsB - starsA;

        var timeA = a.updated_at ? Date.parse(a.updated_at) || 0 : 0;
        var timeB = b.updated_at ? Date.parse(b.updated_at) || 0 : 0;
        if (timeB !== timeA) return timeB - timeA;

        // star 和时间都相同：用本次会话固定的随机值排序，避免每次重排都乱跳
        return (a._rand || 0) - (b._rand || 0);
    }

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
            all.sort(compareProjects);
            visible.sort(compareProjects);
            return { primary: primary, all: all, visible: visible };
        });
        return groups.filter(function (group) {
            return group.visible.length > 0;
        });
    }

    /** 读取数据刷新时间，填到页脚 */
    function loadMeta() {
        var timeNode = document.getElementById("refreshed-at");
        var totalNode = document.getElementById("footer-total");
        if (totalNode) totalNode.textContent = state.projects.length;

        if (!timeNode) return;
        fetch("meta.json", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) throw new Error("no meta");
                return response.json();
            })
            .then(function (meta) {
                if (!meta || !meta.refreshed_at) return;
                var date = new Date(meta.refreshed_at);
                if (isNaN(date.getTime())) return;
                var pad = function (n) {
                    return n < 10 ? "0" + n : String(n);
                };
                timeNode.textContent =
                    date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
                    " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
            })
            .catch(function () {
                timeNode.textContent = "未知";
            });
    }

    /** 首页热门榜：后台算好排序，这里只取前 10 条渲染 */
    function renderTrending() {
        var grid = document.getElementById("hot-grid");
        if (!grid) return;

        fetch("trending.json", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
            })
            .then(function (data) {
                var items = (data.items || []).slice(0, 10);
                if (!items.length) {
                    var section = grid.closest(".content-hot");
                    if (section) section.hidden = true;
                    return;
                }

                var sub = document.getElementById("hot-sub");
                if (sub) {
                    if (!data.ready) {
                        sub.textContent = "热度数据积累中 · 暂按 star 总数排序";
                    } else if (data.partial) {
                        sub.textContent = "按近 " + data.window_days + " 天 star 增量 · 数据积累中";
                    } else {
                        sub.textContent = "按近 " + data.window_days + " 天 star 增量 · Top 10";
                    }
                }

                grid.innerHTML = items
                    .map(function (item, index) {
                        var rank = index + 1;
                        var delta = item.delta7;
                        // 冷启动阶段没有增量数据，就不显示徽章，避免出现一堆「—」
                        var deltaHtml = "";
                        if (delta !== null && delta !== undefined) {
                            deltaHtml =
                                '<span class="hot-delta' + (delta <= 0 ? " zero" : "") + '">' +
                                '<svg class="icon" aria-hidden="true"><use href="#icon-arrow-up"></use></svg>' +
                                (delta > 0 ? "+" : "") + formatCount(delta) +
                                "</span>";
                        }
                        return (
                            '<a class="hot-item' + (item.pinned ? " is-pinned" : "") + '" href="https://github.com/' +
                            escapeHtml(item.repo) +
                            '" target="_blank" rel="noopener noreferrer">' +
                            '<span class="hot-rank r' + rank + '">' + rank + "</span>" +
                            '<div class="hot-main">' +
                            '<div class="hot-name">' + escapeHtml(item.name) +
                            (item.pinned
                                ? '<span class="pin-badge" title="' +
                                  escapeHtml(item.pin_note || "编辑认为值得关注") + '">' +
                                  iconMarkup("pin") + escapeHtml(item.pin_label || "置顶") + "</span>"
                                : "") +
                            "</div>" +
                            '<div class="hot-meta">' + escapeHtml(item.category) + " · " +
                            escapeHtml(item.repo) + " · " + formatCount(item.stars) + "</div>" +
                            "</div>" + deltaHtml + "</a>"
                        );
                    })
                    .join("");
            })
            .catch(function () {
                var section = grid.closest(".content-hot");
                if (section) section.hidden = true;
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

        // 分区先只建骨架，滚到附近再填卡片（懒渲染）
        Array.prototype.forEach.call(els.app.querySelectorAll(".section"), observeSection);

        // 搜索时结果通常很少，直接全部渲染；二级筛选走 refreshSection 局部刷新
        if (state.query) {
            Array.prototype.forEach.call(els.app.querySelectorAll(".section"), fillSection);
        }

        // 卡片进入文档后才能量出标签行数
        applyTagOverflow();
    }

    /** 当前宽度下网格有几列 */
    function gridColumns() {
        var width = els.app ? els.app.clientWidth : 0;
        if (!width) width = Math.min(1240, window.innerWidth - 48);
        var cols = Math.floor((width + 16) / 356); // 最小列宽 340 + 间距 16
        return Math.max(1, Math.min(4, cols));
    }

    /** 懒渲染：分区接近视口时才生成卡片 */
    var sectionObserver = null;

    function observeSection(section) {
        if (!("IntersectionObserver" in window)) {
            fillSection(section);
            return;
        }
        if (!sectionObserver) {
            sectionObserver = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        if (!entry.isIntersecting) return;
                        sectionObserver.unobserve(entry.target);
                        fillSection(entry.target);
                    });
                },
                { rootMargin: "600px 0px" }
            );
        }
        sectionObserver.observe(section);
    }

    /** 骨架屏卡片：懒渲染时的占位 */
    function buildSkeletonCard() {
        var card = document.createElement("div");
        card.className = "skeleton-card";
        card.setAttribute("aria-hidden", "true");
        card.innerHTML =
            '<span class="skeleton-line is-title"></span>' +
            '<span class="skeleton-line is-repo"></span>' +
            '<span class="skeleton-line is-desc"></span>' +
            '<span class="skeleton-line is-desc-2"></span>' +
            '<span class="skeleton-line is-tags"></span>' +
            '<span class="skeleton-line is-foot"></span>';
        return card;
    }

    /** 把某个分区的卡片真正渲染出来 */
    function fillSection(section) {
        if (!section || !section._pending) return;
        var pending = section._pending;
        section._pending = null;

        var grid = section.querySelector(".grid");
        if (!grid) return;
        grid.classList.remove("is-pending");
        grid.removeAttribute("style");
        grid.innerHTML = ""; // 清掉骨架屏
        renderGridCards(grid, pending.projects, pending.primary, section);
    }

    /** 渲染网格：默认只展示两行，其余收进「更多」卡片 */
    function renderGridCards(grid, projects, primary, section) {
        var cols = gridColumns();
        var limit = cols * 2; // 两行
        // 二级筛选不展开，仍然保持两行 + 更多；搜索时展开全部匹配
        var collapsed = !state.query && projects.length > limit;

        var visible = collapsed ? projects.slice(0, limit - 1) : projects;
        visible.forEach(function (project) {
            grid.appendChild(buildCard(project, primary));
        });

        if (!collapsed) return;

        var rest = projects.length - visible.length;
        var more = document.createElement("button");
        more.type = "button";
        more.className = "more-card";
        more.innerHTML =
            '<span class="more-icon">' + iconMarkup("grid-more") + "</span>" +
            '<span class="more-count">+' + rest + "</span>" +
            '<span class="more-label">查看全部 ' + projects.length + " 个</span>";
        more.setAttribute("aria-label", "展开" + primary.label + "全部 " + projects.length + " 个项目");
        more.addEventListener("click", function () {
            grid.removeChild(more);
            projects.slice(visible.length).forEach(function (project) {
                grid.appendChild(buildCard(project, primary));
            });
            applyDescOverflow();
            applyTagOverflow();
        });
        grid.appendChild(more);

        applyDescOverflow();
    }

    /** 简介超过两行时显示「更多」，点击展开全文 / 收起 */
    function applyDescOverflow() {
        Array.prototype.forEach.call(document.querySelectorAll(".card .desc-wrap"), function (wrap) {
            if (wrap.getAttribute("data-bound")) return;

            var desc = wrap.querySelector(".desc");
            var more = wrap.querySelector(".desc-more");
            if (!desc || !more) return;

            wrap.setAttribute("data-bound", "1");

            // 没超出两行就不显示按钮
            if (desc.scrollHeight <= desc.clientHeight + 1) {
                more.hidden = true;
                return;
            }

            more.hidden = false;
            more.addEventListener("click", function (event) {
                event.stopPropagation();
                var open = wrap.classList.toggle("is-open");
                more.textContent = open ? "收起" : "更多";
            });
        });
    }

    /** 标签超过两行时，把多出来的收进 +N，点击 +N 弹出浮层 */
    function applyTagOverflow() {
        Array.prototype.forEach.call(document.querySelectorAll(".card .tags"), function (box) {
            if (box.querySelector(".chip-more")) return;

            var chips = Array.prototype.slice.call(box.querySelectorAll(".chip-tag"));
            if (chips.length < 3) return;

            var firstTop = chips[0].offsetTop;
            var step = chips[0].offsetHeight + 6; // 行高 + 间距
            if (!step) return;

            var fit = 0;
            chips.forEach(function (chip) {
                if (chip.offsetTop - firstTop < step * 2) fit += 1;
            });
            if (fit >= chips.length) return;

            // 留一个位置给 +N
            var visible = Math.max(1, fit - 1);
            var hidden = chips.slice(visible);
            hidden.forEach(function (chip) {
                chip.classList.add("is-hidden");
            });

            var more = document.createElement("button");
            more.type = "button";
            more.className = "chip-more";
            more.textContent = "+" + hidden.length;
            more.setAttribute("aria-label", "查看其余 " + hidden.length + " 个标签");

            var pop = document.createElement("div");
            pop.className = "tag-pop";
            pop.hidden = true;
            pop.innerHTML = hidden
                .map(function (chip) {
                    var cls = chip.className.replace(/\s*is-hidden\s*/, " ").trim();
                    return '<span class="' + cls + '">' + escapeHtml(chip.textContent) + "</span>";
                })
                .join("");

            box.appendChild(more);
            box.appendChild(pop);

            more.addEventListener("click", function (event) {
                event.stopPropagation();
                pop.hidden = !pop.hidden;
            });
            pop.addEventListener("click", function (event) {
                event.stopPropagation();
            });
        });
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

        /* 卡片网格：先放空，等分区接近视口再填充。
           按「列数 × 行数」预估高度，避免填充时页面跳动 */
        var cols = gridColumns();
        var rows = Math.min(Math.ceil(group.visible.length / Math.max(1, cols)), 2);
        var grid = document.createElement("div");
        grid.className = "grid is-pending";
        if (rows > 0) {
            grid.style.minHeight = rows * 310 + (rows - 1) * 16 + "px";
        }
        // 先铺骨架屏占位，滚到附近再换成真实卡片
        var skeletonCount = Math.min(rows * cols, 6);
        for (var i = 0; i < skeletonCount; i++) {
            grid.appendChild(buildSkeletonCard());
        }
        section.appendChild(grid);

        section._pending = { projects: group.visible, primary: primary };

        return section;
    }

    function buildSubChip(primarySlug, subSlug, label, count, isActive) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (isActive ? " is-active" : "");
        chip.innerHTML = escapeHtml(label) + '<span class="n">' + count + "</span>";
        chip.addEventListener("click", function () {
            if (state.sub[primarySlug] === subSlug) return;
            state.sub[primarySlug] = subSlug;
            refreshSection(primarySlug);
        });
        return chip;
    }

    /**
     * 二级筛选：只重渲染当前分区，其他分区保持原样。
     * 渲染前后把分区在视口中的位置对齐，避免筛选时页面跳动。
     */
    function refreshSection(primarySlug) {
        var old = document.getElementById("sec-" + primarySlug);
        if (!old) return;

        var groups = groupProjects();
        var group = null;
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].primary.slug === primarySlug) {
                group = groups[i];
                break;
            }
        }

        var beforeTop = old.getBoundingClientRect().top;
        var next = group ? buildSection(group) : buildEmptySection(primarySlug);
        old.parentNode.replaceChild(next, old);
        if (group) fillSection(next);

        var afterTop = next.getBoundingClientRect().top;
        if (Math.abs(afterTop - beforeTop) > 1) {
            window.scrollBy(0, afterTop - beforeTop);
        }

        renderStatus(groups);
    }

    /** 筛选后该分区没有项目时的占位 */
    function buildEmptySection(primarySlug) {
        var primary = null;
        for (var i = 0; i < TAXONOMY.length; i++) {
            if (TAXONOMY[i].slug === primarySlug) {
                primary = TAXONOMY[i];
                break;
            }
        }

        var section = document.createElement("section");
        section.className = "section";
        section.id = "sec-" + primarySlug;

        if (primary) {
            var head = document.createElement("div");
            head.className = "section-head";
            head.innerHTML =
                '<span class="section-icon" style="background:' + tint(primary.color, .12) + ";color:" + primary.color + '">' +
                iconMarkup(primary.icon) +
                "</span>" +
                '<div class="section-title">' +
                "<h2>" + escapeHtml(primary.label) + "</h2>" +
                "<p>" + escapeHtml(primary.blurb || "") + " · 0 个项目</p>" +
                "</div>";
            section.appendChild(head);
        }

        var empty = document.createElement("div");
        empty.className = "section-empty";
        empty.innerHTML = "<p>这个分类下暂时没有符合筛选条件的项目。</p>";

        var reset = document.createElement("button");
        reset.type = "button";
        reset.className = "btn btn-reset";
        reset.textContent = "查看全部";
        reset.addEventListener("click", function () {
            state.sub[primarySlug] = "all";
            refreshSection(primarySlug);
        });
        empty.appendChild(reset);

        section.appendChild(empty);
        return section;
    }

    /* 平台来源：一个项目可能同时存在于 GitHub 与 Gitee */
    function buildSources(project) {
        var platform = project.platform || "github";
        var list = [];

        if (platform === "github" || platform === "both") {
            if (project.repo) {
                list.push({
                    key: "github",
                    label: "GitHub",
                    url: "https://github.com/" + project.repo,
                    path: project.repo,
                    stars: project.stars
                });
            }
        }

        if (platform === "gitee" || platform === "both") {
            var giteePath = project.gitee_repo || (platform === "gitee" ? project.repo : "");
            if (giteePath) {
                list.push({
                    key: "gitee",
                    label: "Gitee",
                    url: project.gitee_url || "https://gitee.com/" + giteePath,
                    path: giteePath,
                    stars: project.gitee_stars
                });
            }
        }

        return list;
    }

    /** Gitee 源码 zip 直链 */
    function giteeZipUrl(project) {
        var path = project.gitee_repo || project.repo;
        if (!path) return "";
        var branch = project.default_branch || "master";
        return "https://gitee.com/" + path + "/repository/archive/" + branch + ".zip";
    }

    function buildCard(project, primary) {
        var card = document.createElement("article");
        card.className = "card";

        var platform = project.platform || "github";
        var sources = buildSources(project);

        /* 仓库行：每个平台一条，带平台标识 + 路径 + 该平台的 star */
        var repoRow = sources
            .map(function (source) {
                var starPart =
                    typeof source.stars === "number" && source.stars > 0
                        ? '<span class="repo-stars">' + iconMarkup("star") + formatCount(source.stars) + "</span>"
                        : "";
                return (
                    '<a class="repo-item" href="' + escapeHtml(source.url) +
                    '" target="_blank" rel="noopener noreferrer" title="在 ' +
                    escapeHtml(source.label) + ' 打开仓库">' +
                    '<span class="src src-' + source.key + '">' + source.label + "</span>" +
                    "<code>" + escapeHtml(source.path) + "</code>" +
                    starPart +
                    "</a>"
                );
            })
            .join("");

        /* 标签：全部展示，最多两行（数据里最多 6 个，放得下） */
        var sub = resolveSubcategory(project, primary);
        var tagList = [];
        if (sub) tagList.push({ cls: "sub", text: sub.label });
        if (project.deploy_type) tagList.push({ cls: "deploy", text: project.deploy_type });
        (Array.isArray(project.tech_stack) ? project.tech_stack : []).forEach(function (item) {
            tagList.push({ cls: "", text: item });
        });

        var tags = tagList
            .map(function (item) {
                return '<span class="chip-tag ' + item.cls + '">' + escapeHtml(item.text) + "</span>";
            })
            .join("");

        /* 更新时间：双平台取较新的那个 */
        var updatedAt = project.updated_at || "";
        if (project.gitee_updated_at) {
            if (!updatedAt || new Date(project.gitee_updated_at) > new Date(updatedAt)) {
                updatedAt = project.gitee_updated_at;
            }
        }

        var version = project.release ? project.release.tag : "";

        var stats =
            (version
                ? '<span class="stat-item ver-item">' + escapeHtml(version) + "</span>"
                : "") +
            (updatedAt
                ? '<span class="stat-item">' + iconMarkup("clock") + relativeTime(updatedAt) + "</span>"
                : '<span class="stat-item is-empty">' + iconMarkup("clock") + "更新时间待补充</span>");

        /* 每个源各自的下载内容 */
        var sourcePayload = {
            github: {
                assets: Array.isArray(project.best_assets) ? project.best_assets : [],
                srcUrl:
                    project.download_url ||
                    (project.repo
                        ? "https://codeload.github.com/" + project.repo + "/zip/refs/heads/" +
                          (project.default_branch || "main")
                        : "")
            },
            gitee: {
                // Gitee 的发行版资产暂未采集，先只提供源码包
                assets: [],
                srcUrl: giteeZipUrl(project)
            }
        };

        /* 生成某一源对应的下载控件（下载应用 + 下载源码） */
        function buildControls(key) {
            var payload = sourcePayload[key] || sourcePayload.github;
            var list = payload.assets;

            var appButton;
            if (list.length === 0) {
                // 没有安装包：置灰不可点
                appButton =
                    '<span class="btn btn-dl is-disabled" aria-disabled="true" title="' +
                    (key === "gitee"
                        ? "Gitee 源的安装包数据暂未采集，可下载源码自行构建"
                        : "该项目未提供官方编译包，请从源码自行构建或用 Docker 部署") +
                    '">' + iconMarkup("package") + '<span class="btn-label">下载应用</span>' +
                    '<span class="dl-size">' + (key === "gitee" ? "暂无数据" : "无官方包") + "</span></span>";
            } else if (list.length === 1) {
                // 只有一个包：直接下载，不弹面板
                appButton =
                    '<a class="btn btn-dl" href="' + escapeHtml(list[0].url) +
                    '" target="_blank" rel="noopener noreferrer">' +
                    iconMarkup("package") + '<span class="btn-label">下载应用</span>' +
                    '<span class="dl-size">' + escapeHtml(formatSize(list[0].size)) + "</span></a>";
            } else {
                // 多个包：点按钮先弹面板，选一个再下载
                var options = list
                    .map(function (asset) {
                        return (
                            '<a class="pkg-option" href="' + escapeHtml(asset.url) +
                            '" target="_blank" rel="noopener noreferrer">' +
                            '<span class="opt-platform">' + escapeHtml(asset.platform) + "</span>" +
                            '<span class="opt-name" title="' + escapeHtml(asset.name) + '">' +
                            escapeHtml(asset.name) + "</span>" +
                            '<span class="opt-size">' + escapeHtml(formatSize(asset.size)) + "</span>" +
                            "</a>"
                        );
                    })
                    .join("");

                appButton =
                    '<button type="button" class="btn btn-dl has-menu" aria-haspopup="true" ' +
                    'aria-label="选择安装包后下载">' +
                    iconMarkup("package") + '<span class="btn-label">下载应用</span>' +
                    '<span class="dl-caret" aria-hidden="true">' + iconMarkup("caret") + "</span>" +
                    "</button>" +
                    '<div class="pkg-menu" role="menu">' + options + "</div>";
            }

            var srcButton = payload.srcUrl
                ? '<a class="btn btn-src" href="' + escapeHtml(payload.srcUrl) +
                  '" target="_blank" rel="noopener noreferrer">' +
                  iconMarkup("download") + "下载源码</a>"
                : "";

            return appButton + srcButton;
        }

        /* 源切换：单源显示静态标签；双源是一个可点的开关，点一下切到另一个 */
        var canSwitch = sources.length > 1;
        var initialKey = sources.length ? sources[0].key : "github";
        var initialLabel = sources.length ? sources[0].label : "GitHub";

        var srcSwitch = canSwitch
            ? '<button type="button" class="src-toggle" data-src="' + initialKey +
              '" title="点击切换下载源">' +
              '<span class="src-dot src-dot-' + initialKey + '"></span>' +
              '<span class="src-label">' + initialLabel + "</span>" +
              iconMarkup("swap") +
              "</button>"
            : '<span class="src-static">' + initialLabel + "</span>";

        // 置顶徽章：手动维护，有 pin_label 就用它
        var pinnedActive = project.pinned === true && isPinActive(project);
        var pinBadge = pinnedActive
            ? '<span class="pin-badge" title="' +
              escapeHtml(project.pin_note || "编辑认为值得关注") + '">' +
              iconMarkup("pin") +
              escapeHtml(project.pin_label || "置顶") +
              "</span>"
            : "";

        card.innerHTML =
            // 标题 + 置顶徽章 + 协议
            '<div class="title-row">' +
            "<h3>" + escapeHtml(project.name || "未命名项目") + "</h3>" +
            '<div class="title-badges">' + pinBadge +
            '<span class="license" title="' + escapeHtml(project.license || "未知协议") + '">' +
            escapeHtml(project.license || "未知协议") + "</span>" +
            "</div>" +
            "</div>" +
            // 仓库行（1~2 个平台）
            '<div class="repo-row">' + repoRow + "</div>" +
            // 简介：固定两行，超出时出现「更多」可展开
            '<div class="desc-wrap">' +
            '<p class="desc" title="' + escapeHtml(project.note_zh || "") + '">' +
            escapeHtml(project.note_zh || "暂无简介") + "</p>" +
            '<button type="button" class="desc-more" hidden>更多</button>' +
            "</div>" +
            // 版本 + 更新时间
            '<div class="stats-row">' + stats + "</div>" +
            // 标签
            '<div class="tags">' + tags + "</div>" +
            // 下载区：源开关 + 下载控件
            '<div class="card-foot">' +
            srcSwitch +
            '<span class="dl-controls">' + buildControls(initialKey) + "</span>" +
            "</div>";

        /* 点击开关：切到下一个源，下载控件实时跟着变 */
        var srcToggle = card.querySelector(".src-toggle");
        if (srcToggle) {
            srcToggle.addEventListener("click", function () {
                var current = srcToggle.getAttribute("data-src");
                var index = 0;
                for (var i = 0; i < sources.length; i++) {
                    if (sources[i].key === current) index = i;
                }
                var next = sources[(index + 1) % sources.length];

                srcToggle.setAttribute("data-src", next.key);
                srcToggle.querySelector(".src-label").textContent = next.label;
                srcToggle.querySelector(".src-dot").className = "src-dot src-dot-" + next.key;

                var controls = card.querySelector(".dl-controls");
                if (controls) {
                    controls.innerHTML = buildControls(next.key);
                    bindPicker(card);
                }
            });
        }

        bindPicker(card);
        return card;
    }

    /** 收起所有安装包面板（except 指定的那个保持打开） */
    function closeAllPickers(except) {
        Array.prototype.forEach.call(document.querySelectorAll(".btn-dl.has-menu.is-open"), function (button) {
            if (button === except) return;
            button.classList.remove("is-open");
            var menu = button.parentNode.querySelector(".pkg-menu");
            if (menu) menu.classList.remove("is-open");
        });
    }

    /** 绑定单张卡片的安装包下拉。
        一个按钮：没有选项直达，有选项先弹面板。 */
    function bindPicker(card) {
        var trigger = card.querySelector(".btn-dl.has-menu");
        if (!trigger) return;

        var menu = trigger.parentNode.querySelector(".pkg-menu");
        if (!menu) return;

        trigger.addEventListener("click", function (event) {
            event.stopPropagation();
            closeAllPickers(trigger);
            var opened = menu.classList.toggle("is-open");
            trigger.classList.toggle("is-open", opened);
        });

        // 选中某个包时收起面板（链接本身会打开下载）
        Array.prototype.forEach.call(menu.querySelectorAll(".pkg-option"), function (option) {
            option.addEventListener("click", function () {
                menu.classList.remove("is-open");
                trigger.classList.remove("is-open");
            });
        });
    }

    /** 点空白处收起面板：全局只注册一次 */
    function bindPickerDismiss() {
        if (bindPickerDismiss.installed) return;
        bindPickerDismiss.installed = true;
        document.addEventListener("click", function () {
            closeAllPickers(null);
            // 顺便收起 +N 浮层
            Array.prototype.forEach.call(document.querySelectorAll(".tag-pop:not([hidden])"), function (pop) {
                pop.hidden = true;
            });
        });
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

        // 默认视图不占用首屏，只有搜索 / 单分类筛选时才提示命中数量
        if (state.query) {
            els.status.hidden = false;
            els.status.textContent = "搜索「" + state.query + "」，命中 " + shown + " 个项目";
        } else if (groups.length === 1) {
            els.status.hidden = false;
            els.status.textContent = "「" + groups[0].primary.label + "」下 " + shown + " 个项目";
        } else {
            els.status.textContent = "";
            els.status.hidden = true;
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