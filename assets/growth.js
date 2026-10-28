/* 涨星榜页 */
(function () {
    "use strict";

    var sub = document.getElementById("growth-sub");
    var chips = document.getElementById("growth-chips");
    var search = document.getElementById("growth-search");
    var body = document.getElementById("growth-body");
    var empty = document.getElementById("growth-empty");
    var foot = document.getElementById("growth-foot");

    var data = null;
    var all = [];        // 全量，已按增量降序
    var rankOf = {};     // repo -> 全站名次（1 起）
    var activeCat = "__all__";
    var keyword = "";
    var timer = null;

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

    function pad(n) {
        return n < 10 ? "0" + n : String(n);
    }

    function formatTime(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "未知";
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    /**
     * 增量数值：上千用 k 简写（如 +47.7k），千以下显示实际值（如 +832）。
     * 与总 star 列共用同一套 k 口径，避免同一行出现两种量级写法。
     */
    function formatDelta(value) {
        if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
        return String(value);
    }

    /** 增量：正绿 / 零灰 / 负红 / 算不出显示「—」，绝不把 null 当 0 */
    function deltaHtml(value) {
        if (typeof value !== "number") {
            return '<span class="g-delta is-null">—</span>';
        }
        var cls = value > 0 ? "" : value === 0 ? " is-flat" : " is-down";
        var sign = value > 0 ? "+" : "";
        // 简写会丢精度，精确值放 title，悬停可看
        var exact = sign + value.toLocaleString("en-US");
        return (
            '<span class="g-delta' + cls + '" title="' + exact + '">' +
            sign + formatDelta(value) + "</span>"
        );
    }

    function chipHtml(key, label, count) {
        return (
            '<button type="button" class="g-chip' + (key === activeCat ? " is-on" : "") +
            '" data-cat="' + escapeHtml(key) + '">' + escapeHtml(label) +
            '<span class="g-chip-n">' + count + "</span></button>"
        );
    }

    /** 分类 chip 从数据现算，不写死，避免分类变动后对不上 */
    function renderChips() {
        var counts = {};
        all.forEach(function (item) {
            counts[item.category] = (counts[item.category] || 0) + 1;
        });
        var cats = Object.keys(counts).sort(function (a, b) {
            return counts[b] - counts[a];
        });
        var html = chipHtml("__all__", "全部", all.length);
        cats.forEach(function (cat) {
            html += chipHtml(cat, cat, counts[cat]);
        });
        chips.innerHTML = html;
    }

    function matches(item) {
        if (activeCat !== "__all__" && item.category !== activeCat) return false;
        if (!keyword) return true;
        var k = keyword.toLowerCase();
        return (
            String(item.name).toLowerCase().indexOf(k) !== -1 ||
            String(item.repo).toLowerCase().indexOf(k) !== -1
        );
    }

    function renderRows() {
        var rows = all.filter(matches);

        if (!rows.length) {
            body.innerHTML = "";
            empty.hidden = false;
            foot.textContent = "共 " + all.length + " 个项目，当前筛选无匹配";
            return;
        }
        empty.hidden = true;

        body.innerHTML = rows
            .map(function (item) {
                var rank = rankOf[item.repo] || 0;
                var rankCls = "g-rank" + (rank >= 1 && rank <= 3 ? " r" + rank : "");
                return (
                    '<a class="g-row" href="detail.html?repo=' + encodeURIComponent(item.repo) + '">' +
                    '<span class="' + rankCls + '">' + rank + "</span>" +
                    '<span class="g-name"><b>' + escapeHtml(item.name) + "</b>" +
                    "<em>" + escapeHtml(item.repo) + "</em></span>" +
                    '<span class="g-cat">' + escapeHtml(item.category) + "</span>" +
                    deltaHtml(item.delta7) +
                    '<span class="g-star">' + icon("star") + formatCount(item.stars) + "</span>" +
                    "</a>"
                );
            })
            .join("");

        foot.textContent =
            "显示 " + rows.length + " / " + all.length + " 个｜站点总计 " +
            all.length + " 个项目｜数据更新于 " + formatTime(data.generated_at);
    }

    function renderSub() {
        var days = data.window_days;
        var base = "按近 " + days + " 天 star 增量排序 · " + all.length + " 个项目";
        if (days < 7) {
            sub.textContent = base + " · 数据积累中（已记录 " + data.history_days + " 天）";
        } else {
            sub.textContent = base + " · 每天自动更新";
        }
    }

    function bindEvents() {
        chips.addEventListener("click", function (event) {
            var btn = event.target.closest(".g-chip");
            if (!btn) return;
            activeCat = btn.getAttribute("data-cat");
            renderChips();
            renderRows();
        });

        search.addEventListener("input", function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                keyword = search.value.trim();
                renderRows();
            }, 120);
        });
    }

    function render(payload) {
        data = payload || {};
        all = Array.isArray(data.items) ? data.items : [];

        rankOf = {};
        all.forEach(function (item, index) {
            rankOf[item.repo] = index + 1;
        });

        if (!all.length) {
            sub.textContent = "暂无数据";
            empty.hidden = false;
            empty.textContent = "还没有可展示的增量数据。";
            return;
        }

        renderSub();
        renderChips();
        renderRows();
        bindEvents();
    }

    fetch("data/star-growth.json?t=" + Date.now(), { cache: "no-store" })
        .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
        })
        .then(render)
        .catch(function (error) {
            sub.textContent = "加载失败";
            empty.hidden = false;
            empty.textContent = "加载失败：" + error.message;
            foot.textContent = "";
        });
})();
