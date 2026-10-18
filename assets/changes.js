/* 更新日志页 */
(function () {
    "use strict";

    var body = document.getElementById("changes-body");
    var foot = document.getElementById("changes-foot");
    var sub = document.getElementById("changes-sub");

    var LABELS = {
        license: { text: "许可协议变更", tone: "warn" },
        archived: { text: "仓库已归档", tone: "warn" },
        unarchived: { text: "恢复维护", tone: "good" },
        pinned: { text: "加入置顶", tone: "brand" },
        unpinned: { text: "取消置顶", tone: "" },
        pin_label: { text: "推荐位调整", tone: "brand" }
    };

    function esc(text) {
        return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    function escAttr(text) {
        return esc(text);
    }

    function detailText(item) {
        if (item.from != null && item.to != null) {
            return (
                '<span class="change-from">' + esc(item.from || "—") + "</span>" +
                '<span class="change-arrow">→</span>' +
                '<span class="change-to">' + esc(item.to || "—") + "</span>"
            );
        }
        return '<span class="change-none">—</span>';
    }

    function renderEmpty(feed) {
        body.innerHTML =
            '<div class="changes-empty">' +
            "<h2>暂时还没有记录</h2>" +
            "<p>系统刚建立监控基线，正在每日比对 <b>" + (feed.monitored || 0) + "</b> 个项目的" +
            "许可协议、仓库归档状态，以及本站的置顶与推荐位。</p>" +
            "<p class=\"changes-empty-note\">一旦发现变化，会自动在这里留下一条带日期的记录。" +
            "单个项目的变动也会显示在该项目详情页的「变动记录」中。</p>" +
            "</div>";
    }

    function render(items) {
        body.innerHTML = items
            .map(function (item) {
                var meta = LABELS[item.type] || { text: item.type, tone: "" };
                return (
                    '<a class="recent-row changes-row" role="row" href="detail.html?repo=' +
                    encodeURIComponent(item.repo) + '">' +
                    '<span class="c-time" role="cell">' + esc(item.date) + "</span>" +
                    '<span class="c-name" role="cell"><b>' + esc(item.name) + "</b>" +
                    '<span class="name-repo">' + esc(item.repo) + "</span></span>" +
                    '<span class="c-cat" role="cell">' + esc(item.category || "—") + "</span>" +
                    '<span class="c-type" role="cell"><span class="change-tag ' + meta.tone + '">' +
                    esc(meta.text) + "</span></span>" +
                    '<span class="c-detail" role="cell">' + detailText(item) + "</span>" +
                    "</a>"
                );
            })
            .join("");
    }

    function initToTop() {
        var btn = document.getElementById("to-top");
        if (!btn) return;
        function onScroll() {
            btn.classList.toggle("is-visible", window.scrollY > 400);
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        btn.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    initToTop();

    fetch("data/changes-feed.json?t=" + Date.now(), { cache: "no-store" })
        .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
        })
        .then(function (feed) {
            var items = Array.isArray(feed.items) ? feed.items : [];

            if (sub) {
                sub.textContent =
                    "项目许可协议变更、仓库归档、置顶与推荐调整 · 每天自动比对 · 监控 " +
                    (feed.monitored || 0) + " 个项目";
            }

            if (!items.length) {
                renderEmpty(feed);
                if (foot) foot.textContent = "";
                return;
            }

            render(items);
            if (foot) {
                foot.textContent =
                    "共 " + items.length + " 条记录 · 只保留最近 3 年 · 数据刷新于 " +
                    new Date(feed.generated_at).toLocaleString("zh-CN", { hour12: false });
            }
        })
        .catch(function (error) {
            body.innerHTML =
                '<div class="changes-empty"><h2>加载失败</h2><p>' +
                esc(error.message || "未知错误") + "</p></div>";
        });
})();