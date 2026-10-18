/* 最近收录页 */
(function () {
    "use strict";

    var body = document.getElementById("recent-body");
    var sub = document.getElementById("recent-sub");
    var foot = document.getElementById("recent-foot");

    function escapeHtml(text) {
        return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    function icon(name) {
        return '<svg class="icon" aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
    }

    function formatCount(value) {
        if (typeof value !== "number") return "—";
        if (value >= 10000) return (value / 1000).toFixed(1) + "k";
        return String(value);
    }

    function pad(n) {
        return n < 10 ? "0" + n : String(n);
    }

    /** 投稿人：带头像与主页链接；早期收录的项目没有这个字段 */
    function renderContributor(login) {
        if (!login) return '<span class="c-by-none">—</span>';
        return (
            '<a class="c-by-link" href="https://github.com/' + escapeHtml(login) +
            '" target="_blank" rel="noopener noreferrer">' +
            '<img class="c-by-avatar" src="https://github.com/' + escapeHtml(login) +
            '.png?size=40" alt="" loading="lazy" width="16" height="16">' +
            "@" + escapeHtml(login) + "</a>"
        );
    }

    function formatAdded(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        return (
            d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
        );
    }

    function formatDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function render(data) {
        var items = (data && data.items) || [];

        if (!items.length) {
            body.innerHTML = '<p class="recent-empty">最近 ' + (data.days || 7) + " 天还没有新收录的项目。</p>";
            foot.textContent = "";
            return;
        }

        sub.textContent = "按收录时间倒序 · 最近 " + data.days + " 天 · 每天自动更新";

        body.innerHTML = items
            .map(function (item) {
                var download = item.download_url
                    ? '<a class="recent-dl" href="' + escapeHtml(item.download_url) +
                      '" target="_blank" rel="noopener noreferrer">' + icon("download") + "源码</a>"
                    : '<span class="recent-dl is-off">—</span>';

                return (
                    '<div class="recent-row">' +
                    '<span class="c-time">' + formatAdded(item.added_at) + "</span>" +
                    '<span class="c-name">' +
                    '<a href="https://github.com/' + escapeHtml(item.repo) +
                    '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.name) + "</a>" +
                    '<em>' + escapeHtml(item.repo) + "</em>" +
                    (item.subcategory
                        ? '<i class="recent-sub">' + escapeHtml(item.subcategory) + "</i>"
                        : "") +
                    "</span>" +
                    '<span class="c-cat">' + escapeHtml(item.category) + "</span>" +
                    '<span class="c-by">' + renderContributor(item.submitted_by) + "</span>" +
                    '<span class="c-lic">' + escapeHtml(item.license || "—") + "</span>" +
                    '<span class="c-star">' + icon("star") + formatCount(item.stars) + "</span>" +
                    '<span class="c-act">' + download + "</span>" +
                    "</div>"
                );
            })
            .join("");

        foot.textContent =
            "共收录 " + items.length + " 个（最近 " + data.days + " 天）｜站点总计 " +
            data.total_projects + " 个项目｜数据更新于 " + formatDate(data.refreshed_at);
    }

    fetch("recent.json?t=" + Date.now(), { cache: "no-store" })
        .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
        })
        .then(render)
        .catch(function (error) {
            body.innerHTML = '<p class="recent-empty">加载失败：' + escapeHtml(error.message) + "</p>";
        });
})();