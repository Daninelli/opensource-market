/* 项目详情页 */
(function () {
    "use strict";

    var root = document.getElementById("detail");
    var params = new URLSearchParams(location.search);
    var repo = (params.get("repo") || "").trim();

    /* ------------------------------ 工具函数 ------------------------------ */

    function escapeHtml(text) {
        return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    function icon(name) {
        return '<svg class="icon" aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
    }

    function formatCount(value) {
        if (typeof value !== "number" || isNaN(value)) return "—";
        if (value >= 10000) return (value / 1000).toFixed(1) + "k";
        return String(value);
    }

    function formatSize(bytes) {
        if (typeof bytes !== "number" || bytes <= 0) return "";
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
        return (bytes / 1048576).toFixed(1) + " MB";
    }

    function pad(n) {
        return n < 10 ? "0" + n : String(n);
    }

    function formatDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function relativeTime(iso) {
        var t = Date.parse(iso || "");
        if (isNaN(t)) return "—";
        var diff = Date.now() - t;
        var min = Math.floor(diff / 60000);
        if (min < 60) return min <= 1 ? "刚刚" : min + " 分钟前";
        var hour = Math.floor(min / 60);
        if (hour < 24) return hour + " 小时前";
        var day = Math.floor(hour / 24);
        if (day < 30) return day + " 天前";
        var month = Math.floor(day / 30);
        if (month < 12) return month + " 个月前";
        return Math.floor(month / 12) + " 年前";
    }

    function toSlug(value) {
        return String(value).replace("/", "__");
    }

    /**
     * 从共享的 star 快照里取这个项目的曲线。
     *
     * 为什么不在分片里存：star 每天都在变，写进 159 个分片会让它们
     * 每天全部重写，白白撑大 Git 历史。快照文件是唯一每天变动的数据源。
     *
     * @param {{dates: string[], series: Object}} history 全站 star 快照
     * @param {string} repo 仓库全名
     * @param {number} window 展示窗口（天）
     */
    function buildStarData(history, repo, window) {
        var dates = (history && Array.isArray(history.dates)) ? history.dates : [];
        var values = (history && history.series) ? history.series[repo] : null;

        if (!Array.isArray(values) || !values.length) {
            return { stars: null, series: [], delta7: null, delta30: null };
        }

        // 对齐日期，缺失补 null
        var series = dates.map(function (date, i) {
            return {
                date: date,
                stars: typeof values[i] === "number" ? values[i] : null
            };
        });

        // 当前 star 数 = 最后一个有效值
        var stars = null;
        for (var i = values.length - 1; i >= 0; i -= 1) {
            if (typeof values[i] === "number") {
                stars = values[i];
                break;
            }
        }

        /**
         * N 天增量：只有快照天数足够覆盖整个窗口时才算。
         * 否则「近 7 天」和「近 30 天」会算出同一个数字（假数据）。
         */
        function delta(days) {
            if (values.length < days + 1) return null;
            var last = values[values.length - 1];
            var base = values[values.length - 1 - days];
            if (typeof last !== "number" || typeof base !== "number") return null;
            return last - base;
        }

        // 曲线只展示最近 window 天
        var tail = series.slice(Math.max(0, series.length - window));

        return {
            stars: stars,
            series: tail,
            delta7: delta(7),
            delta30: delta(30)
        };
    }

    /* ------------------------------ Star 曲线 ------------------------------ */

    /**
     * 用原生 SVG 画折线 + 面积，不引任何图表库。
     * 点数不足 2 个时调用方不会走这里。
     *
     * 画布宽度取宿主容器的实际像素宽，viewBox 与像素 1:1，
     * 这样日期刻度才是「按屏幕宽度」算的，也不会被 preserveAspectRatio 拉扁。
     *
     * @param {Array} series 曲线数据
     * @param {HTMLElement} host 承载 SVG 的容器（必须已在文档中）
     */
    function renderChart(series, host) {
        var H = 168;
        var PAD_L = 46;
        var PAD_R = 14;
        var PAD_T = 14;
        var PAD_B = 26;

        var W = Math.round(host.clientWidth || 720);
        W = Math.max(240, Math.min(1100, W)); // 别让极端宽度把布局撑坏

        var points = series.filter(function (p) {
            return typeof p.stars === "number";
        });
        if (points.length < 2) return "";

        var values = points.map(function (p) {
            return p.stars;
        });
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        // 拉平区间，避免全平时曲线贴边
        if (max === min) {
            max = min + 1;
        }
        var span = max - min;
        var innerW = W - PAD_L - PAD_R;
        var innerH = H - PAD_T - PAD_B;

        function x(i) {
            return PAD_L + (innerW * i) / (points.length - 1);
        }
        function y(v) {
            return PAD_T + innerH * (1 - (v - min) / span);
        }

        var line = points
            .map(function (p, i) {
                return (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(p.stars).toFixed(1);
            })
            .join(" ");

        var area =
            line +
            " L" + x(points.length - 1).toFixed(1) + "," + (PAD_T + innerH) +
            " L" + PAD_L + "," + (PAD_T + innerH) + " Z";

        // Y 轴只标最大、最小，避免拥挤
        var yLabels =
            '<text class="chart-axis" x="' + (PAD_L - 8) + '" y="' + (PAD_T + 6) + '" text-anchor="end">' +
            formatCount(max) + "</text>" +
            '<text class="chart-axis" x="' + (PAD_L - 8) + '" y="' + (PAD_T + innerH) + '" text-anchor="end">' +
            formatCount(min) + "</text>";

        /**
         * X 轴日期标签：按可用宽度决定标几个 —— 宽屏最多 7 个，窄屏收到 3 个。
         *
         * 之前写死首/中/尾 3 个，桌面宽屏上整条曲线只有 3 个刻度，
         * 中间几天是哪天只能靠悬停。现在按可用宽度反推：
         * 每 88px 一个刻度（「10-17」约 34px 宽 + 54px 呼吸间距）。
         *   · 宽屏约 840px 可用 → 9 → 封顶 7 个
         *   · 约 350px 可用      → 3 个
         *   · 约 300px 可用      → 3 个（保底）
         */
        function xTickIndices(count) {
            var tickW = 88;
            var usable = W - PAD_L - PAD_R;
            var ticks = Math.min(7, Math.max(3, Math.floor(usable / tickW)));
            ticks = Math.min(ticks, count); // 数据点比 3 个还少时不能硬凑
            if (ticks <= 1) return [count - 1];

            // 均匀取样，首尾必留
            var idx = [];
            for (var i = 0; i < ticks; i += 1) {
                idx.push(Math.round((i * (count - 1)) / (ticks - 1)));
            }
            // 去重（点数少、刻度密时会出现重复）
            var seen = {};
            return idx.filter(function (i) {
                if (seen[i]) return false;
                seen[i] = true;
                return true;
            });
        }

        var xIdx = xTickIndices(points.length);
        var xLabels = xIdx
            .map(function (i) {
                var d = points[i].date || "";
                return '<text class="chart-axis" x="' + x(i).toFixed(1) + '" y="' + (H - 8) +
                    '" text-anchor="' + (i === 0 ? "start" : i === points.length - 1 ? "end" : "middle") +
                    '">' + escapeHtml(d.slice(5)) + "</text>";
            })
            .join("");

        // 悬停提示：每个点一个热区
        var hotspots = points
            .map(function (p, i) {
                var cx = x(i).toFixed(1);
                var cy = y(p.stars).toFixed(1);
                return '<g class="chart-hit">' +
                    '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="transparent"></circle>' +
                    '<circle class="chart-dot" cx="' + cx + '" cy="' + cy + '" r="3"></circle>' +
                    '<title>' + escapeHtml(p.date) + " · " + p.stars + " star</title>" +
                    "</g>";
            })
            .join("");

        return (
            '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
            '" role="img" aria-label="Star 变化曲线">' +
            '<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#16a34a" stop-opacity=".18"/>' +
            '<stop offset="100%" stop-color="#16a34a" stop-opacity="0"/>' +
            "</linearGradient></defs>" +
            '<path d="' + area + '" fill="url(#chart-fill)"/>' +
            '<path d="' + line + '" fill="none" stroke="#16a34a" stroke-width="2" ' +
            'stroke-linejoin="round" stroke-linecap="round"/>' +
            yLabels + xLabels + hotspots +
            "</svg>"
        );
    }

    /** Star 区块：有曲线画曲线，数据不够就说明原因，绝不画假曲线 */
    var chartResizeTimer = null;
    var chartLastWidth = 0;

    /**
     * 把曲线真正画进容器。放在 root.innerHTML 赋值之后调用，
     * 这样容器已有真实宽度，X 轴刻度数量才是按当前屏幕算的。
     */
    function paintChart(data) {
        var host = document.querySelector(".star-panel-chart");
        if (!host || !data.star) return;
        host.innerHTML = renderChart(data.star.series || [], host);
        chartLastWidth = host.clientWidth;
    }

    /**
     * 窗口尺寸变化时重画曲线：X 轴刻度数量跟着面板宽度走。
     * 只有宽度变化超过 40px 才重画，避免拖窗口时反复重建 DOM。
     */
    function bindChartResize(data) {
        if (!document.querySelector(".star-panel-chart")) return;

        window.addEventListener("resize", function () {
            if (chartResizeTimer) clearTimeout(chartResizeTimer);
            chartResizeTimer = setTimeout(function () {
                var box = document.querySelector(".star-panel-chart");
                if (!box) return;
                if (Math.abs(box.clientWidth - chartLastWidth) < 40) return;
                paintChart(data);
            }, 150);
        });
    }

    function renderStarPanel(data) {
        var star = data.star || { series: [], delta7: null, delta30: null };
        var series = Array.isArray(star.series) ? star.series : [];
        var valid = series.filter(function (p) {
            return typeof p.stars === "number";
        });

        var deltaBits = "";
        if (typeof star.delta7 === "number") {
            var d7 = star.delta7;
            deltaBits +=
                '<span class="star-delta' + (d7 > 0 ? "" : " is-zero") + '">' +
                icon("arrow-up") + (d7 > 0 ? "+" : "") + formatCount(d7) + " 本周</span>";
        }
        if (typeof star.delta30 === "number") {
            var d30 = star.delta30;
            deltaBits +=
                '<span class="star-delta' + (d30 > 0 ? "" : " is-zero") + '">' +
                icon("arrow-up") + (d30 > 0 ? "+" : "") + formatCount(d30) + " 30 天</span>";
        }

        var body;
        if (valid.length >= 2) {
            // 空壳容器：图表要量宿主宽度才能定 X 轴刻度，必须等它进文档后再画
            body = '<div class="star-panel-chart"></div>';
            // 点数不足时明确提示，避免 2 个点被误读成「持续增长」
            if (valid.length < 7) {
                body +=
                    '<p class="chart-note">' + icon("clock") +
                    "数据积累中（已记录 " + valid.length + " 天），满 7 天后曲线才完整</p>";
            }
        } else {
            // 数据还没攒够：不画假曲线，直接说明
            body =
                '<div class="chart-empty">' +
                icon("clock") +
                "<span>Star 趋势数据积累中（已记录 " + valid.length + " 天），满 7 天后显示曲线</span>" +
                "</div>";
        }

        return (
            '<section class="detail-panel">' +
            '<div class="panel-head">' +
            "<h2>Star 趋势</h2>" +
            '<div class="star-summary">' +
            '<span class="star-total">' + icon("star") + formatCount(star.stars) + "</span>" +
            deltaBits +
            "</div>" +
            "</div>" +
            body +
            "</section>"
        );
    }

    /* ------------------------------ 截图 ------------------------------ */

    /* ------------------------------ 下载 ------------------------------ */

    function renderDownloads(data) {
        var assets = Array.isArray(data.assets) ? data.assets : [];
        var rows = assets
            .map(function (a) {
                return (
                    '<li class="dl-row">' +
                    '<span class="dl-name">' + escapeHtml(a.name) + "</span>" +
                    '<span class="dl-size">' + formatSize(a.size) + "</span>" +
                    '<a class="dl-link" href="' + escapeHtml(a.url) + '" target="_blank" rel="noopener noreferrer">' +
                    icon("download") + "下载</a>" +
                    "</li>"
                );
            })
            .join("");

        var releaseLine = data.release && data.release.tag
            ? '<span class="dl-tag">' + escapeHtml(data.release.tag) + "</span>"
            : "";

        if (!rows) {
            return (
                '<section class="detail-panel">' +
                '<div class="panel-head"><h2>下载</h2>' + releaseLine + "</div>" +
                '<p class="dl-empty">该项目没有提供编译好的安装包，请从源码构建，或前往 GitHub 查看 Releases。</p>' +
                "</section>"
            );
        }

        return (
            '<section class="detail-panel">' +
            '<div class="panel-head"><h2>下载</h2>' + releaseLine +
            '<span class="panel-hint">共 ' + assets.length + " 个文件</span></div>" +
            '<ul class="dl-list">' + rows + "</ul>" +
            "</section>"
        );
    }

    /* ------------------------------ 变动记录 ------------------------------ */

    var CHANGE_LABELS = {
        license: { text: "许可协议变更", tone: "warn" },
        archived: { text: "仓库已归档", tone: "warn" },
        unarchived: { text: "仓库恢复维护", tone: "good" },
        pinned: { text: "加入置顶", tone: "brand" },
        unpinned: { text: "取消置顶", tone: "" },
        pin_label: { text: "推荐位调整", tone: "brand" }
    };

    /** 项目变动记录；没有记录就整块不渲染 */
    function renderChanges(changes) {
        if (!Array.isArray(changes) || !changes.length) return "";

        var rows = changes
            .slice()
            .sort(function (a, b) {
                return a.date < b.date ? 1 : -1;
            })
            .map(function (item) {
                var meta = CHANGE_LABELS[item.type] || { text: item.type, tone: "" };
                var detail = "";
                // 协议变更 / 推荐位变化都带 from → to
                if (item.from != null && item.to != null) {
                    detail =
                        '<span class="change-from">' + escapeHtml(item.from || "—") + "</span>" +
                        '<span class="change-arrow">→</span>' +
                        '<span class="change-to">' + escapeHtml(item.to || "—") + "</span>";
                }
                return (
                    '<li class="change-row">' +
                    '<time class="change-date">' + escapeHtml(item.date) + "</time>" +
                    '<span class="change-tag ' + meta.tone + '">' + escapeHtml(meta.text) + "</span>" +
                    '<span class="change-detail">' + detail + "</span>" +
                    "</li>"
                );
            })
            .join("");

        return (
            '<section class="detail-panel">' +
            '<div class="panel-head"><h2>变动记录</h2>' +
            '<span class="panel-hint">自动检测 · 最多保留 3 年</span></div>' +
            '<ul class="change-list">' + rows + "</ul>" +
            "</section>"
        );
    }

    /* ------------------------------ 基本信息 ------------------------------ */

    function renderFacts(data) {
        var rows = [];

        if (data.release && data.release.tag) {
            rows.push(["最新版本", escapeHtml(data.release.tag)]);
        }
        rows.push(["最近推送", relativeTime(data.updated_at) + ' <span class="fact-sub">' + formatDate(data.updated_at) + "</span>"]);
        rows.push(["默认分支", "<code>" + escapeHtml(data.default_branch) + "</code>"]);
        if (data.deploy_type) rows.push(["部署方式", escapeHtml(data.deploy_type)]);
        if (data.license) rows.push(["开源协议", escapeHtml(/^NOASSERTION$/i.test(data.license) ? "协议待核" : data.license)]);
        if (data.added_at) rows.push(["收录时间", formatDate(data.added_at)]);
        if (data.submitted_by) {
            rows.push([
                "贡献者",
                '<a class="fact-link" href="https://github.com/' + escapeHtml(data.submitted_by) +
                '" target="_blank" rel="noopener noreferrer">@' + escapeHtml(data.submitted_by) + "</a>"
            ]);
        }
        if (data.gitee && data.gitee.repo) {
            rows.push([
                "Gitee 镜像",
                '<a class="fact-link" href="' + escapeHtml(data.gitee.url) + '" target="_blank" rel="noopener noreferrer">' +
                escapeHtml(data.gitee.repo) + (typeof data.gitee.stars === "number" ? " · ★" + formatCount(data.gitee.stars) : "") +
                "</a>"
            ]);
        }

        var html = rows
            .map(function (pair) {
                return (
                    '<div class="fact">' +
                    '<dt>' + pair[0] + "</dt>" +
                    "<dd>" + pair[1] + "</dd>" +
                    "</div>"
                );
            })
            .join("");

        return (
            '<section class="detail-panel">' +
            '<div class="panel-head"><h2>基本信息</h2></div>' +
            '<dl class="facts">' + html + "</dl>" +
            "</section>"
        );
    }

    /* ------------------------------ 主渲染 ------------------------------ */

    function render(data) {
        var giteeHref = data.gitee && data.gitee.url ? data.gitee.url : null;
        var repoHref = "https://github.com/" + data.repo;

        var pinBadge = data.pinned
            ? '<span class="pin-badge">' + icon("pin") + escapeHtml(data.pin_label || "置顶") + "</span>"
            : "";

        /* 推荐理由：只有带置顶/推荐标签的项目才有，
           没有标签或没有写理由就整块不渲染。 */
        var pinPanel = "";
        if (data.pinned && data.pin_note) {
            pinPanel =
                '<section class="pin-panel">' +
                '<div class="pin-panel-head">' +
                '<span class="pin-panel-label">' + icon("pin") +
                escapeHtml(data.pin_label || "置顶") + "</span>" +
                '<span class="pin-panel-title">推荐理由</span>' +
                "</div>" +
                '<p class="pin-panel-note">' + escapeHtml(data.pin_note) + "</p>" +
                "</section>";
        }

        var tags = (data.tech_stack || [])
            .map(function (t) {
                return '<span class="chip">' + escapeHtml(t) + "</span>";
            })
            .join("");

        // 非 OSI 开源协议：自动判定后展示，避免用户误以为全部都是开源项目
        var licenseBadge = "";
        var licenseNotice = "";
        if (data.license_category === "restricted") {
            licenseBadge = '<span class="license-badge">非开源</span>';
            licenseNotice =
                '<div class="license-notice">' +
                icon("info") +
                "<span>该项目使用 <b>" + escapeHtml(/^NOASSERTION$/i.test(data.license) ? "协议待核" : (data.license || "未知协议")) +
                "</b>，属于「源码公开可获取」但<b>不属于 OSI 认可的开源协议</b>，通常对商业使用或托管服务有限制。" +
                "商用或二次分发前，请务必阅读原仓库的许可条款。</span>" +
                "</div>";
        } else if (data.license_category === "unknown") {
            licenseNotice =
                '<div class="license-notice is-muted">' +
                icon("info") +
                "<span>该项目的许可协议（<b>" + escapeHtml(/^NOASSERTION$/i.test(data.license) ? "协议待核" : (data.license || "未标注")) +
                "</b>）不属于常见的软件开源协议，可能是自定义条款或内容类协议（如 CC 系列）。" +
                "能否商用需按原条款判断，请以原仓库的 LICENSE 文件为准。</span>" +
                "</div>";
        }

        // 变动记录：协议变更、归档等，全部由脚本自动累积
        var changesPanel = renderChanges(data.changes);

        var crumb =
            '<nav class="detail-crumb">' +
            '<a href="index.html">开源集市</a>' +
            '<span class="crumb-sep">/</span>' +
            '<a href="index.html#' + escapeHtml(data.category_slug) + '">' + escapeHtml(data.category) + "</a>" +
            (data.subcategory
                ? '<span class="crumb-sep">/</span><span>' + escapeHtml(data.subcategory) + "</span>"
                : "") +
            "</nav>";

        var actions =
            '<div class="detail-actions">' +
            '<a class="btn-primary" href="' + escapeHtml(repoHref) + '" target="_blank" rel="noopener noreferrer">' +
            icon("github") + "前往 GitHub</a>" +
            (giteeHref
                ? '<a class="btn-ghost" href="' + escapeHtml(giteeHref) + '" target="_blank" rel="noopener noreferrer">Gitee 镜像</a>'
                : "") +
            (data.download_url
                ? '<a class="btn-ghost" href="' + escapeHtml(data.download_url) + '" target="_blank" rel="noopener noreferrer">' +
                  icon("download") + "下载源码</a>"
                : "") +
            "</div>";

        var html =
            '<a class="detail-back" href="index.html">' + icon("arrow-left") + "返回开源集市</a>" +
            crumb +
            '<header class="detail-head">' +
            '<div class="detail-title-row">' +
            "<h1>" + escapeHtml(data.name) + "</h1>" +
            pinBadge +
            licenseBadge +
            (data.license ? '<span class="license">' + escapeHtml(data.license) + "</span>" : "") +
            "</div>" +
            '<a class="detail-repo" href="' + escapeHtml(repoHref) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(data.repo) + icon("external") + "</a>" +
            (data.note_zh ? '<p class="detail-desc">' + escapeHtml(data.note_zh) + "</p>" : "") +
            (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
            licenseNotice +
            actions +
            "</header>" +
            pinPanel +
            renderStarPanel(data) +
            renderFacts(data) +
            renderDownloads(data) +
            changesPanel;

        root.innerHTML = html;
        document.title = data.name + " · 开源集市";

        // 图表刻度是按面板像素宽算的，等 DOM 进文档后再画，之后跟随窗口重画
        paintChart(data);
        bindChartResize(data);

        // 顶部锚点
        var sentinel = document.createElement("div");
        sentinel.className = "top-sentinel";
        document.body.insertBefore(sentinel, document.body.firstChild);

        var toTop = document.getElementById("to-top");
        if (toTop) {
            if (typeof IntersectionObserver === "function") {
                new IntersectionObserver(function (entries) {
                    toTop.classList.toggle("is-visible", !entries[0].isIntersecting);
                }).observe(sentinel);
            }
            toTop.addEventListener("click", function () {
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        }
    }

    function renderError(message) {
        root.innerHTML =
            '<div class="detail-error">' +
            "<h1>打不开这个项目</h1>" +
            "<p>" + escapeHtml(message) + "</p>" +
            '<a class="btn-primary" href="index.html">返回开源集市</a>' +
            "</div>";
    }

    /* ------------------------------ 启动 ------------------------------ */

    if (!repo || repo.indexOf("/") === -1) {
        renderError("地址里没有指定项目。请从首页卡片点进来。");
        return;
    }

    if (repo.indexOf("..") !== -1 || repo.length > 200) {
        renderError("项目地址不合法。");
        return;
    }

    var bust = "?t=" + Date.now();

    // 分片只含静态信息；star 曲线读共享快照现算，避免分片每天被重写
    var shardPromise = fetch("data/detail/" + toSlug(repo) + ".json" + bust, { cache: "no-store" })
        .then(function (response) {
            if (response.status === 404) {
                throw new Error("没有找到「" + repo + "」的数据，可能已下线。");
            }
            if (!response.ok) {
                throw new Error("加载失败：HTTP " + response.status);
            }
            return response.json();
        });

    // 快照拿不到不算失败：页面照常显示，只是没有 star 曲线
    var historyPromise = fetch("data/stars-history.json" + bust, { cache: "no-store" })
        .then(function (response) {
            return response.ok ? response.json() : { dates: [], series: {} };
        })
        .catch(function () {
            return { dates: [], series: {} };
        });

    Promise.all([shardPromise, historyPromise])
        .then(function (results) {
            var data = results[0];
            var history = results[1];
            data.star = buildStarData(history, repo, 7);
            render(data);
        })
        .catch(function (error) {
            renderError(error.message || "未知错误");
        });
})();