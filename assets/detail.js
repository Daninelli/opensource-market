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

    /* ------------------------------ Star 曲线 ------------------------------ */

    /**
     * 用原生 SVG 画折线 + 面积，不引任何图表库。
     * 点数不足 2 个时调用方不会走这里。
     */
    function renderChart(series) {
        var W = 720;
        var H = 168;
        var PAD_L = 46;
        var PAD_R = 14;
        var PAD_T = 14;
        var PAD_B = 26;

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

        // X 轴：首、中、尾三个日期
        var xIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
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
            '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" ' +
            'aria-label="Star 变化曲线">' +
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

    /** Star 区块：有曲线画曲线，没有就说明为什么没有 */
    function renderStarPanel(data) {
        var series = Array.isArray(data.star_series) ? data.star_series : [];
        var valid = series.filter(function (p) {
            return typeof p.stars === "number";
        });

        var deltaBits = "";
        if (typeof data.delta_7d === "number") {
            var d7 = data.delta_7d;
            deltaBits +=
                '<span class="star-delta' + (d7 > 0 ? "" : " is-zero") + '">' +
                icon("arrow-up") + (d7 > 0 ? "+" : "") + formatCount(d7) + " 本周</span>";
        }
        if (typeof data.delta_30d === "number") {
            var d30 = data.delta_30d;
            deltaBits +=
                '<span class="star-delta' + (d30 > 0 ? "" : " is-zero") + '">' +
                icon("arrow-up") + (d30 > 0 ? "+" : "") + formatCount(d30) + " 30 天</span>";
        }

        var body;
        if (valid.length >= 2) {
            body = renderChart(series);
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
            '<span class="star-total">' + icon("star") + formatCount(data.stars) + "</span>" +
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

    /* ------------------------------ 基本信息 ------------------------------ */

    function renderFacts(data) {
        var rows = [];

        if (data.release && data.release.tag) {
            rows.push(["最新版本", escapeHtml(data.release.tag)]);
        }
        rows.push(["最近推送", relativeTime(data.updated_at) + ' <span class="fact-sub">' + formatDate(data.updated_at) + "</span>"]);
        rows.push(["默认分支", "<code>" + escapeHtml(data.default_branch) + "</code>"]);
        if (data.deploy_type) rows.push(["部署方式", escapeHtml(data.deploy_type)]);
        if (data.license) rows.push(["开源协议", escapeHtml(data.license)]);
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

        var tags = (data.tech_stack || [])
            .map(function (t) {
                return '<span class="chip">' + escapeHtml(t) + "</span>";
            })
            .join("");

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
            (data.license ? '<span class="license">' + escapeHtml(data.license) + "</span>" : "") +
            "</div>" +
            '<a class="detail-repo" href="' + escapeHtml(repoHref) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(data.repo) + icon("external") + "</a>" +
            (data.note_zh ? '<p class="detail-desc">' + escapeHtml(data.note_zh) + "</p>" : "") +
            (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
            actions +
            "</header>" +
            renderStarPanel(data) +
            renderFacts(data) +
            renderDownloads(data);

        root.innerHTML = html;
        document.title = data.name + " · 开源集市";

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

    // 用分片文件，只下载这一个项目的数据
    fetch("data/detail/" + toSlug(repo) + ".json?t=" + Date.now(), { cache: "no-store" })
        .then(function (response) {
            if (response.status === 404) {
                throw new Error("没有找到「" + repo + "」的数据，可能已下线。");
            }
            if (!response.ok) {
                throw new Error("加载失败：HTTP " + response.status);
            }
            return response.json();
        })
        .then(render)
        .catch(function (error) {
            renderError(error.message || "未知错误");
        });
})();