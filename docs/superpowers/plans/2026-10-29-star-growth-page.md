# 涨星榜页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「涨星榜」页面，按近 7 天 star 增量倒序展示全部 1699 个项目，支持分类筛选与关键词搜索。

**Architecture:** 新增一个 node 生成器把 `projects.json` + `data/stars-history.json` 合成为独立派生文件 `data/star-growth.json`（约 249KB，不污染首页 `trending.json`）；页面沿用 `recent.html` + `assets/recent.js` 的「独立页读精简 JSON」模式。

**Tech Stack:** 原生 HTML/CSS/JS（无框架、无构建、无依赖），Node.js 内置模块（`fs/promises`、`path`、`url`），GitHub Actions。

## Global Constraints

- **禁止 emoji**：所有图标必须是 `growth.html` 内 `<symbol>` 的手绘 24×24 线性 SVG，`stroke-width: 1.8`，颜色继承 `currentColor`。
- **禁止第三方库 / CDN**：不引字体、图标库、框架、图表库。
- **改 CSS/JS 必须升版本号**：`index.html`、`detail.html`、`recent.html`、`changes.html`、`licenses.html`、`disclaimer.html`、`growth.html` 里的 `assets/site.css?v=` 全部升到同一新值；`assets/growth.js?v=` 自带。
- **本仓库没有测试框架**：验证手段是 `node -e` 内联断言、`node tools/check-data.mjs`、以及本地 `python -m http.server` + 浏览器实测。计划里的「Run test」步骤都是这三类，不要引入 jest/vitest。
- **CSS 变量**（已存在，直接用）：`--surface:#ffffff`、`--border:#e5e7eb`、`--border-strong:#d3d7dd`、`--ink:#111827`、`--ink-soft:#374151`、`--muted:#6b7280`、`--faint:#9ca3af`、`--brand:#15803d`、`--max-width:1240px`。
- **圆角规范**：卡片 16px、按钮 8px、chip 6px；间距取 4 的倍数。
- **推送用 `tools/push.ps1`**，不要裸 `git push`；合并用 `--no-rebase`。
- **只 `git add` 计划内的文件**：仓库里有大量 `_*` 临时文件（`.gitignore` 已挡）和 `_batch2/` 目录（**未被 gitignore 覆盖，绝不能 `git add -A`**）。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `tools/build-growth.mjs` | 新增。唯一负责把两个数据源合成涨星榜 JSON，含排序与窗口降级 |
| `data/star-growth.json` | 新增（产物）。页面数据源，紧凑 JSON |
| `growth.html` | 新增。页面骨架 + 图标精灵 + 表格头 + 筛选区 DOM |
| `assets/growth.js` | 新增。唯一负责读 JSON、算分类计数、渲染行、处理筛选/搜索 |
| `assets/site.css` | 修改。新增 `.growth-*` / `.g-*` 样式段 |
| `.github/workflows/refresh-data.yml` | 修改。增加生成步骤 + 纳入自动提交 |
| 6 个既有页面 | 修改。顶栏与页脚加「涨星榜」入口 |

---

### Task 1: 生成器 `tools/build-growth.mjs`

**Files:**
- Create: `tools/build-growth.mjs`
- Output: `data/star-growth.json`

**Interfaces:**
- Consumes: `projects.json`（数组，每项含 `repo`/`name`/`category`/`category_slug`/`subcategory`/`stars`）、`data/stars-history.json`（`{dates: string[], series: {[repo]: (number|null)[]}}`）
- Produces: `data/star-growth.json`，形状为
  `{generated_at: string, window_days: number, history_days: number, count: number, items: Array<{repo:string, name:string, category:string, category_slug:string, subcategory:string|null, stars:number|null, delta7:number|null}>}`
  其中 `items` 已按 `delta7` 降序、`null` 垫底、同增量按 `stars` 降序、再同按 `repo` 字典序。

- [ ] **Step 1: 写生成器**

创建 `tools/build-growth.mjs`：

```js
/**
 * 生成涨星榜：data/star-growth.json
 *
 * 为什么单独一个文件：
 *   trending.json 只给首页热门榜 Top 20，涨星榜要全量 1699 个。
 *   合在一起会让首页每次多下载约 230KB，所以拆开生成。
 *
 * 用法：node tools/build-growth.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_DAYS = 7;

const projects = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

let history = { dates: [], series: {} };
try {
    history = JSON.parse(await readFile(join(root, "data", "stars-history.json"), "utf8"));
} catch {
    console.warn("没有找到 data/stars-history.json，将输出无增量数据的榜单");
}

const dates = Array.isArray(history.dates) ? history.dates : [];
const series = history.series || {};
const historyDays = dates.length;

// 历史不足 7 天时按实际可用天数降级，避免「近 7 天」算出假增量
const windowDays = Math.max(0, Math.min(WINDOW_DAYS, historyDays - 1));

/** 取某仓库的窗口增量；算不出返回 null（绝不编造 0） */
function deltaOf(repo) {
    if (windowDays <= 0) return null;
    const values = series[repo];
    if (!Array.isArray(values) || values.length < windowDays + 1) return null;
    const last = values[values.length - 1];
    const base = values[values.length - 1 - windowDays];
    if (typeof last !== "number" || typeof base !== "number") return null;
    return last - base;
}

const items = projects
    .filter((project) => project.repo)
    .map((project) => ({
        repo: project.repo,
        name: project.name,
        category: project.category,
        category_slug: project.category_slug,
        subcategory: project.subcategory || null,
        stars: typeof project.stars === "number" ? project.stars : null,
        delta7: deltaOf(project.repo)
    }));

// 排序：增量降序 → null 垫底 → star 总数降序 → repo 字典序（保证输出稳定，避免无意义 diff）
items.sort((a, b) => {
    const da = a.delta7 === null ? -Infinity : a.delta7;
    const db = b.delta7 === null ? -Infinity : b.delta7;
    if (db !== da) return db - da;
    const sa = a.stars === null ? -1 : a.stars;
    const sb = b.stars === null ? -1 : b.stars;
    if (sb !== sa) return sb - sa;
    return a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0;
});

const output = {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    history_days: historyDays,
    count: items.length,
    items
};

// 紧凑输出：缩进会把体积从约 249KB 撑到约 358KB
await writeFile(
    join(root, "data", "star-growth.json"),
    JSON.stringify(output) + "\n",
    "utf8"
);

const withDelta = items.filter((x) => x.delta7 !== null);
const up = withDelta.filter((x) => x.delta7 > 0).length;
const flat = withDelta.filter((x) => x.delta7 === 0).length;
const down = withDelta.filter((x) => x.delta7 < 0).length;

console.log(
    `star-growth.json 已生成：${items.length} 条｜窗口 ${windowDays} 天｜历史 ${historyDays} 天`
);
console.log(`  可算增量 ${withDelta.length} 个：涨 ${up} / 平 ${flat} / 跌 ${down}`);
items.slice(0, 5).forEach((x, i) => {
    console.log(`  ${i + 1}. ${x.name}  +${x.delta7}  总 ${x.stars}`);
});
```

- [ ] **Step 2: 运行生成器**

```bash
node tools/build-growth.mjs
```

Expected 输出形如：
```
star-growth.json 已生成：1699 条｜窗口 7 天｜历史 12 天
  可算增量 1698 个：涨 1614 / 平 39 / 跌 45
  1. Rea  +47676  总 399458
  ...
```
（具体数字随当天快照浮动，但 `1699 条`、`可算增量 1698 个` 这两个数在 12 天快照下应稳定。）

- [ ] **Step 3: 断言产物结构正确**

```bash
node -e "
const d = require('./data/star-growth.json');
const assert = require('node:assert');
assert.strictEqual(d.count, d.items.length, 'count 与 items 长度不一致');
assert.strictEqual(d.items.length, require('./projects.json').length, '项目数应与 projects.json 一致');
assert.strictEqual(d.window_days, 7, '窗口应为 7 天');
// 排序：非空增量必须单调不增
const withD = d.items.filter(x => x.delta7 !== null).map(x => x.delta7);
for (let i = 1; i < withD.length; i++) assert.ok(withD[i] <= withD[i-1], '增量未降序 @' + i);
// null 必须全部在末尾
const firstNull = d.items.findIndex(x => x.delta7 === null);
if (firstNull !== -1) assert.ok(d.items.slice(firstNull).every(x => x.delta7 === null), 'null 未全部垫底');
// 字段齐全
const keys = ['repo','name','category','category_slug','subcategory','stars','delta7'];
d.items.forEach(x => keys.forEach(k => assert.ok(k in x, '缺字段 ' + k + ' @' + x.repo)));
console.log('OK 结构断言全部通过；首项=' + d.items[0].name + ' +' + d.items[0].delta7);
"
```

Expected: `OK 结构断言全部通过；首项=Rea +47676`

- [ ] **Step 4: 断言体积在预算内**

```bash
node -e "
const s = require('fs').statSync('data/star-growth.json').size;
console.log('体积: ' + (s/1024).toFixed(1) + ' KB');
if (s > 400*1024) { console.error('超出 400KB 预算，检查是否误用了缩进输出'); process.exit(1); }
console.log('OK 体积在预算内');
"
```

Expected: `体积: 24x.x KB` 且 `OK 体积在预算内`

- [ ] **Step 5: 提交**

```bash
git add tools/build-growth.mjs data/star-growth.json
git commit -m "feat: 新增涨星榜生成器，产出全量 7 天增量榜单"
```

---

### Task 2: 页面骨架 `growth.html`

**Files:**
- Create: `growth.html`

**Interfaces:**
- Produces 供 Task 3/4 使用的 DOM 契约（id 必须完全一致）：
  `#growth-sub`（副标题）、`#growth-chips`（分类 chip 容器）、`#growth-search`（搜索 input）、`#growth-body`（行容器）、`#growth-empty`（空状态，默认 `hidden`）、`#growth-foot`（页脚统计）

- [ ] **Step 1: 写页面骨架**

创建 `growth.html`（图标精灵只放本页用到的 5 个 symbol；顶栏/页脚结构照抄 `recent.html`）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="开源集市涨星榜：按近 7 天 star 增量排序的全部开源项目，支持分类筛选与搜索，每天自动更新。">
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <title>涨星榜 · 开源集市</title>
    <link rel="stylesheet" href="assets/site.css?v=20261029a">
</head>
<body>
    <svg class="icon-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <symbol id="icon-market" viewBox="0 0 24 24">
            <path d="M3.2 9 4.75 4.2a1 1 0 0 1 .95-.7h12.6a1 1 0 0 1 .95.7L20.8 9"/>
            <path d="M3.2 9a2.93 2.93 0 0 0 5.87 0 2.93 2.93 0 0 0 5.86 0 2.93 2.93 0 0 0 5.87 0"/>
            <path d="M5.2 12.2V18M18.8 12.2V18M3.2 18h17.6"/>
            <path d="M9.6 18v-3.2a.8.8 0 0 1 .8-.8h3.2a.8.8 0 0 1 .8.8V18"/>
        </symbol>
        <symbol id="icon-github" viewBox="0 0 24 24">
            <path d="M9.2 20.4c-4.2 1.2-4.2-2.1-5.9-2.6m11.8 5v-3.4c0-1 .1-1.4-.5-2 2.4-.3 4.9-1.2 4.9-5.4a4.2 4.2 0 0 0-1.2-2.9 3.9 3.9 0 0 0-.1-2.9s-.9-.3-3 1.2a10.3 10.3 0 0 0-5.4 0C7.7 6 6.8 6.3 6.8 6.3a3.9 3.9 0 0 0-.1 2.9 4.2 4.2 0 0 0-1.2 2.9c0 4.2 2.5 5.1 4.9 5.4-.6.6-.6 1.2-.5 2v3.4"/>
        </symbol>
        <symbol id="icon-star" viewBox="0 0 24 24">
            <path d="m12 4 2.4 5 5.6.8-4 3.9.95 5.5L12 16.6 7.05 19.2 8 13.7 4 9.8 9.6 9Z"/>
        </symbol>
        <symbol id="icon-search" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.4"/>
            <path d="m15.8 15.8 4.4 4.4"/>
        </symbol>
        <symbol id="icon-info" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.4"/>
            <path d="M12 11v5.2"/>
            <path d="M12 7.9h.01"/>
        </symbol>
    </svg>

    <nav class="topnav">
        <div class="topnav-inner">
            <a class="topnav-brand" href="index.html">
                <span class="topnav-mark" aria-hidden="true">
                    <svg class="icon"><use href="#icon-market"></use></svg>
                </span>
                <span class="topnav-name">开源集市</span>
            </a>
            <div class="topnav-links">
                <a href="recent.html">最近收录</a>
                <a href="growth.html" style="color:var(--ink);background:#f3f4f6">涨星榜</a>
                <a href="changes.html">更新日志</a>
                <a href="licenses.html">协议说明</a>
                <a href="disclaimer.html">免责声明</a>
                <a href="https://github.com/Daninelli/opensource-market/issues/new" target="_blank" rel="noopener noreferrer">提交项目</a>
                <a class="topnav-github" href="https://github.com/Daninelli/opensource-market" target="_blank" rel="noopener noreferrer">
                    <svg class="icon" aria-hidden="true"><use href="#icon-github"></use></svg>
                    <span>GitHub</span>
                </a>
            </div>
        </div>
    </nav>

    <main class="growth-wrap">
        <a class="doc-back" href="index.html">← 返回开源集市</a>

        <div class="growth-head">
            <h1>涨星榜</h1>
            <p id="growth-sub">按近 7 天 star 增量排序 · 加载中…</p>
        </div>

        <div class="growth-bar">
            <div class="growth-chips" id="growth-chips" role="group" aria-label="按分类筛选"></div>
            <label class="growth-search">
                <svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg>
                <input id="growth-search" type="search" placeholder="搜索项目名或仓库名" autocomplete="off" aria-label="搜索项目">
            </label>
        </div>

        <div class="growth-table" role="table" aria-label="涨星榜项目列表">
            <div class="g-row g-row-head" role="row">
                <span role="columnheader">#</span>
                <span role="columnheader">项目</span>
                <span role="columnheader">分类</span>
                <span role="columnheader">近 7 天</span>
                <span class="g-star" role="columnheader">总 Star</span>
            </div>
            <div id="growth-body"></div>
        </div>

        <p class="growth-empty" id="growth-empty" hidden>没有匹配的项目</p>
        <p class="growth-foot" id="growth-foot"></p>
    </main>

    <footer class="footer">
        <div class="footer-links">
            <a href="index.html">开源集市</a>
            <a href="recent.html">最近收录</a>
            <a href="growth.html">涨星榜</a>
            <a href="changes.html">更新日志</a>
            <a href="licenses.html">开源协议说明</a>
            <a href="disclaimer.html">免责声明</a>
            <a href="https://github.com/Daninelli/opensource-market" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>
        </div>
        <div class="footer-notice">
            <svg class="icon" aria-hidden="true"><use href="#icon-info"></use></svg>
            <span><b>信息可能已过期。</b>本页 star 数与增量为脚本定时抓取，并非实时；
            项目可能已停止维护、变更协议、迁移或删除仓库。<b>一切以项目官方仓库的实际内容与 LICENSE 文件为准</b>，
            本站信息不构成授权或法律意见。详见 <a href="disclaimer.html">免责声明</a>。</span>
        </div>
        <p>收录项目的代码、商标与文档均归原作者所有。数据由脚本自动抓取，<strong>可能滞后或有误差，请以项目仓库的实际内容与许可协议为准</strong>。部分项目采用非开源协议，商用前务必查阅原文。</p>
        <p class="footer-license">
            本站页面与数据以 <strong>MIT 协议</strong>开源 ·
            <a href="https://github.com/Daninelli/opensource-market/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">查看协议</a> ·
            欢迎 <a href="https://github.com/Daninelli/opensource-market/pulls" target="_blank" rel="noopener noreferrer">Pull Request</a>
        </p>
    </footer>

    <script src="assets/growth.js?v=20261029a"></script>
</body>
</html>
```

- [ ] **Step 2: 断言 DOM 契约齐全**

```bash
node -e "
const html = require('fs').readFileSync('growth.html','utf8');
const assert = require('node:assert');
['growth-sub','growth-chips','growth-search','growth-body','growth-empty','growth-foot'].forEach(id => {
  assert.ok(html.includes('id=\"' + id + '\"'), '缺 id=' + id);
});
['icon-market','icon-github','icon-star','icon-search','icon-info'].forEach(s => {
  assert.ok(html.includes('id=\"' + s + '\"'), '缺 symbol=' + s);
});
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), '含 emoji，违反铁律');
assert.ok(html.includes('site.css?v=') && html.includes('growth.js?v='), '缺版本号参数');
console.log('OK DOM 契约与图标断言通过');
"
```

Expected: `OK DOM 契约与图标断言通过`

- [ ] **Step 3: 提交**

```bash
git add growth.html
git commit -m "feat: 新增涨星榜页面骨架与图标精灵"
```

---

### Task 3: 样式 `.growth-*` / `.g-*`

**Files:**
- Modify: `assets/site.css`（在「最近收录页」样式段之后插入新段，约 1243 行 `.recent-foot` 之后）

**Interfaces:**
- Consumes: Task 2 的类名契约 `.growth-wrap`/`.growth-head`/`.growth-bar`/`.growth-chips`/`.g-chip`/`.growth-search`/`.growth-table`/`.g-row`/`.g-row-head`/`.g-rank`/`.g-name`/`.g-cat`/`.g-delta`/`.g-star`/`.growth-empty`/`.growth-foot`
- Produces: 无（纯样式）

- [ ] **Step 1: 插入桌面样式**

在 `assets/site.css` 里 `.recent-foot { ... }` 那一行之后插入：

```css
        /* ------------------------------ 涨星榜页 ------------------------------ */
        .growth-wrap {
            max-width: var(--max-width);
            margin: 0 auto;
            padding: 34px 20px 64px;
        }
        .growth-head { margin-bottom: 16px; }
        .growth-head h1 { margin: 0 0 6px; font-size: 1.6rem; letter-spacing: -.02em; }
        .growth-head p { margin: 0; color: var(--muted); font-size: 13px; }

        .growth-bar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .growth-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .g-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--ink-soft);
            border-radius: 6px;
            padding: 4px 9px;
            font-size: 12.5px;
            font-family: inherit;
            cursor: pointer;
            transition: background .12s, border-color .12s, color .12s;
        }
        .g-chip:hover { background: #f7f8fa; border-color: var(--border-strong); }
        .g-chip.is-on { background: var(--brand); border-color: var(--brand); color: #fff; }
        .g-chip-n { font-size: 11px; opacity: .62; font-variant-numeric: tabular-nums; }
        .g-chip.is-on .g-chip-n { opacity: .82; }

        .growth-search {
            display: flex;
            align-items: center;
            gap: 7px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--surface);
            padding: 0 11px;
            height: 34px;
            max-width: 320px;
        }
        .growth-search .icon { font-size: 14px; color: var(--faint); flex: none; }
        .growth-search input {
            border: 0;
            outline: 0;
            background: none;
            flex: 1;
            min-width: 0;
            font-size: 13px;
            font-family: inherit;
            color: var(--ink);
        }
        .growth-search input::placeholder { color: var(--faint); }

        .growth-table {
            border: 1px solid var(--border);
            border-radius: 14px;
            background: var(--surface);
            overflow: hidden;
        }
        .g-row {
            display: grid;
            grid-template-columns: 44px minmax(0, 1fr) 96px 104px 92px;
            align-items: center;
            gap: 10px;
            padding: 11px 18px;
            font-size: 13px;
            color: inherit;
            text-decoration: none;
        }
        .g-row + .g-row { border-top: 1px solid #f4f5f7; }
        .g-row:not(.g-row-head):hover { background: #fafbfc; }
        .g-row-head {
            font-size: 12px;
            color: var(--faint);
            background: #fafbfc;
            font-weight: 500;
        }
        .g-row-head:hover { background: #fafbfc; }

        .g-rank { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--faint); }
        .g-rank.r1 { color: #dc2626; }
        .g-rank.r2 { color: #ea580c; }
        .g-rank.r3 { color: #d97706; }

        .g-name { min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .g-name b { font-weight: 600; color: var(--ink); }
        .g-name em { font-style: normal; font-size: 11.5px; color: var(--faint); }

        .g-cat { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .g-delta { font-variant-numeric: tabular-nums; font-weight: 600; color: #15803d; white-space: nowrap; }
        .g-delta.is-flat { color: var(--faint); font-weight: 500; }
        .g-delta.is-down { color: #dc2626; }
        .g-delta.is-null { color: var(--faint); font-weight: 500; }

        .g-star {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: var(--muted);
            font-variant-numeric: tabular-nums;
            justify-self: end;
            white-space: nowrap;
        }
        .g-star .icon { font-size: 12px; color: #d97706; }

        .growth-empty { padding: 40px 20px; text-align: center; color: var(--muted); font-size: 13px; }
        .growth-foot { margin-top: 14px; color: var(--faint); font-size: 12px; }
```

- [ ] **Step 2: 插入窄屏样式**

在文件末尾的 `@media (max-width: 640px)` 块内（与 `.recent-row` 那条同一块，约 1441 行 `.c-act` 之后）追加：

```css
            /* 涨星榜：窄屏改成两行卡片 */
            .growth-wrap { padding: 24px 14px 48px; }
            .growth-table { border: 0; background: none; border-radius: 0; overflow: visible; }
            .g-row-head { display: none; }
            .g-row {
                grid-template-columns: 26px minmax(0, 1fr) auto;
                grid-template-areas:
                    "rank name  star"
                    ".    cat   delta";
                gap: 3px 10px;
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 12px;
                margin-bottom: 8px;
                padding: 11px 13px;
            }
            .g-row + .g-row { border-top: 1px solid var(--border); }
            .g-rank { grid-area: rank; align-self: start; }
            .g-name { grid-area: name; }
            .g-star { grid-area: star; justify-self: end; }
            .g-cat { grid-area: cat; font-size: 12px; }
            .g-delta { grid-area: delta; justify-self: end; }
            .growth-search { max-width: none; }
```

- [ ] **Step 3: 断言样式类齐全**

```bash
node -e "
const css = require('fs').readFileSync('assets/site.css','utf8');
const assert = require('node:assert');
['.growth-wrap','.growth-head','.growth-bar','.growth-chips','.g-chip','.growth-search','.growth-table','.g-row','.g-row-head','.g-rank','.g-name','.g-cat','.g-delta','.g-star','.growth-empty','.growth-foot'].forEach(c => {
  assert.ok(css.includes(c), '缺样式 ' + c);
});
// 窄屏块里必须有 grid-template-areas
assert.ok(/\.g-row\s*\{[^}]*grid-template-areas/.test(css), '窄屏缺 grid-template-areas');
// 括号平衡
let depth = 0; for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth--; }
assert.strictEqual(depth, 0, 'CSS 花括号不平衡');
console.log('OK 样式类与括号断言通过');
"
```

Expected: `OK 样式类与括号断言通过`

- [ ] **Step 4: 提交**

```bash
git add assets/site.css
git commit -m "style: 涨星榜页面样式，含窄屏两行卡片布局"
```

---

### Task 4: 渲染与交互 `assets/growth.js`

**Files:**
- Create: `assets/growth.js`

**Interfaces:**
- Consumes: `data/star-growth.json`（Task 1 的形状）、Task 2 的 6 个 id
- Produces: 无（页面终态）

- [ ] **Step 1: 写渲染脚本**

创建 `assets/growth.js`：

```js
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

    /** 增量：正绿 / 零灰 / 负红 / 算不出显示「—」，绝不把 null 当 0 */
    function deltaHtml(value) {
        if (typeof value !== "number") {
            return '<span class="g-delta is-null">—</span>';
        }
        var cls = value > 0 ? "" : value === 0 ? " is-flat" : " is-down";
        var sign = value > 0 ? "+" : "";
        return '<span class="g-delta' + cls + '">' + sign + value.toLocaleString("en-US") + "</span>";
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
```

- [ ] **Step 2: 语法检查**

```bash
node --check assets/growth.js && echo "OK 语法通过"
```

Expected: `OK 语法通过`

- [ ] **Step 3: 断言实现覆盖了规格里的关键点**

```bash
node -e "
const js = require('fs').readFileSync('assets/growth.js','utf8');
const assert = require('node:assert');
assert.ok(js.includes('detail.html?repo='), '行链接应指向本站详情页');
assert.ok(js.includes('encodeURIComponent'), 'repo 需 urlencode');
assert.ok(js.includes('120'), '搜索需 120ms 防抖');
assert.ok(/setTimeout/.test(js), '缺防抖');
assert.ok(/toLowerCase/.test(js), '搜索需不区分大小写');
assert.ok(js.includes('is-null'), 'null 增量需单独样式');
assert.ok(!/pinned/.test(js), '不应依赖置顶字段');
console.log('OK 关键实现点断言通过');
"
```

Expected: `OK 关键实现点断言通过`

- [ ] **Step 4: 本地起服务并人工确认渲染**

```bash
python -m http.server 8899 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:8899/growth.html`，确认：
1. 首行是增量最大的项目，名次 1 为红色
2. 页面底部统计显示「显示 1699 / 1699 个」
3. 增量负数显示红色、`null` 显示「—」

- [ ] **Step 5: 提交**

```bash
git add assets/growth.js
git commit -m "feat: 涨星榜渲染与分类筛选、关键词搜索"
```

---

### Task 5: 导航接入 6 个既有页面

**Files:**
- Modify: `index.html`（`.topnav-links`、`.footer-links`）
- Modify: `detail.html`（同上）
- Modify: `recent.html`（同上）
- Modify: `changes.html`（同上）
- Modify: `licenses.html`（同上）
- Modify: `disclaimer.html`（同上）

**Interfaces:**
- Consumes: `growth.html` 已存在
- Produces: 无

- [ ] **Step 1: 在各页顶栏插入入口**

插入位置按文件分两类（已核实实际结构，不要靠猜）：

**A 类** —— `index.html`、`detail.html`、`recent.html`、`changes.html`、`disclaimer.html`：顶栏里有 `<a href="recent.html">最近收录</a>`，在它**之后**插入：

```html
                <a href="growth.html">涨星榜</a>
```

**B 类** —— `licenses.html`：顶栏是精简版，只有「协议说明 / 免责声明 / 提交项目 / GitHub」，**没有**「最近收录」链接。插在 `.topnav-links` 的**第一个** `<a>` 之前（即 `<a href="licenses.html" style="color:var(--ink);background:#f3f4f6">协议说明</a>` 之前）：

```html
                <a href="growth.html">涨星榜</a>
```

注意：`growth.html` 自己已在 Task 2 写好了入口，本任务不要重复改它。

- [ ] **Step 2: 在各页页脚插入入口**

对上述 6 个文件，在 `.footer-links` 里含「最近收录」的那一行之后插入：

```html
            <a href="growth.html">涨星榜</a>
```

- [ ] **Step 3: 断言每个页面入口数量精确为 2**

每个页面应当恰好 2 处（顶栏 1 + 页脚 1）：

```bash
node -e "
const fs = require('fs');
const assert = require('node:assert');
const pages = ['index.html','detail.html','recent.html','changes.html','licenses.html','disclaimer.html','growth.html'];
pages.forEach(p => {
  const html = fs.readFileSync(p,'utf8');
  const n = (html.match(/href=\"growth\.html\"/g) || []).length;
  assert.strictEqual(n, 2, p + ' 入口数应为 2，实际 ' + n);
});
console.log('OK 7 个页面各有 2 处涨星榜入口（顶栏 + 页脚）');
"
```

Expected: `OK 7 个页面各有 2 处涨星榜入口（顶栏 + 页脚）`

- [ ] **Step 4: 提交**

```bash
git add index.html detail.html recent.html changes.html licenses.html disclaimer.html
git commit -m "feat: 各页顶栏与页脚加入涨星榜入口"
```

---

### Task 6: CI 接入 `refresh-data.yml`

**Files:**
- Modify: `.github/workflows/refresh-data.yml`

**Interfaces:**
- Consumes: `tools/build-growth.mjs`（Task 1）
- Produces: 每日自动更新 `data/star-growth.json`

- [ ] **Step 1: 增加生成步骤**

在「生成最近收录」那一步之后插入：

```yaml
      - name: 生成涨星榜
        run: node tools/build-growth.mjs
```

- [ ] **Step 2: 把产物纳入「有变化就提交」**

修改该步骤里的两处文件列表：

```yaml
          if git diff --quiet -- projects.json trending.json recent.json data/star-growth.json data/stars-history.json data/changes.json data/changes-feed.json data/detail; then
```

```yaml
            git add projects.json meta.json trending.json recent.json data/star-growth.json data/stars-history.json data/changes.json data/changes-feed.json data/detail
```

- [ ] **Step 3: 断言 YAML 改动正确**

```bash
node -e "
const y = require('fs').readFileSync('.github/workflows/refresh-data.yml','utf8');
const assert = require('node:assert');
assert.ok(/生成涨星榜/.test(y), '缺生成步骤');
assert.ok(/node tools\/build-growth\.mjs/.test(y), '缺生成命令');
const diffLine = y.split('\n').find(l => l.includes('git diff --quiet'));
assert.ok(diffLine.includes('data/star-growth.json'), 'diff 判断缺 star-growth.json');
const addLine = y.split('\n').find(l => l.trim().startsWith('git add projects.json'));
assert.ok(addLine.includes('data/star-growth.json'), 'git add 缺 star-growth.json');
// 缩进必须是 10 空格（与相邻 step 对齐）
const stepLine = y.split('\n').find(l => l.includes('- name: 生成涨星榜'));
assert.strictEqual(stepLine.search(/\S/), 6, '步骤缩进应为 6 空格，实际 ' + stepLine.search(/\S/));
console.log('OK CI 接入断言通过');
"
```

Expected: `OK CI 接入断言通过`

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/refresh-data.yml
git commit -m "chore: CI 每日生成并提交涨星榜数据"
```

---

### Task 7: 版本号统一升级 + 端到端验证

**Files:**
- Modify: 7 个 HTML 的 `assets/site.css?v=`
- Verify: `growth.html`、`data/star-growth.json`、`tools/check-data.mjs`

**Interfaces:**
- Consumes: 前 6 个任务的全部产物
- Produces: 可发布的最终状态

- [ ] **Step 1: 统一升级 site.css 版本号**

把 7 个页面里的 `assets/site.css?v=<旧值>` 统一改成 `assets/site.css?v=20261029a`（`recent.html` 原本没有版本号参数，这次一并加上）。

```powershell
$files = @("index.html","detail.html","recent.html","changes.html","licenses.html","disclaimer.html","growth.html")
foreach ($f in $files) {
  $c = Get-Content $f -Raw
  $c = $c -replace 'assets/site\.css(\?v=[0-9a-z]+)?', 'assets/site.css?v=20261029a'
  Set-Content -Path $f -Value $c -NoNewline -Encoding UTF8
}
```

- [ ] **Step 2: 断言 7 个页面版本号一致**

```bash
node -e "
const fs = require('fs');
const assert = require('node:assert');
const pages = ['index.html','detail.html','recent.html','changes.html','licenses.html','disclaimer.html','growth.html'];
pages.forEach(p => {
  const m = fs.readFileSync(p,'utf8').match(/site\.css\?v=([0-9a-z]+)/);
  assert.ok(m, p + ' 缺 site.css 版本号');
  assert.strictEqual(m[1], '20261029a', p + ' 版本号不一致: ' + m[1]);
});
console.log('OK 7 个页面 site.css 版本号统一为 20261029a');
"
```

Expected: `OK 7 个页面 site.css 版本号统一为 20261029a`

- [ ] **Step 3: 跑数据自检**

```bash
node tools/check-data.mjs
```

Expected: 末行 `[OK] 数据检查通过`

- [ ] **Step 4: 端到端浏览器验证（多断点）**

起服务后逐项确认：

```bash
python -m http.server 8899 --bind 127.0.0.1
```

| 断点 | 检查项 |
| --- | --- |
| 1440px | 5 列表头对齐；1699 行；名次 1/2/3 分别为红/橙/黄 |
| 768px | 列不重叠，分类列不换行破版 |
| 375px | 变两行卡片：第一行名次+项目+总star，第二行分类+增量；无横向滚动条 |

交互确认：
1. 点「工具」chip → 行数变 1085，chip 高亮切换
2. 搜索 `agent` → 结果全部命中名称或仓库名
3. 「工具」+ `agent` 同时生效（AND）
4. 搜 `zzzzzz` → 显示「没有匹配的项目」
5. 点任意一行 → 跳详情页且标题正确
6. 用 URL 参数绕过缓存打开 `growth.html?t=1`，确认无 JS 报错（控制台干净）

- [ ] **Step 5: 提交版本号**

```bash
git add index.html detail.html recent.html changes.html licenses.html disclaimer.html growth.html
git commit -m "chore: 涨星榜上线，统一升级 site.css 版本号"
```

- [ ] **Step 6: 推送**

```powershell
pwsh -NoProfile -File '.\tools\push.ps1' -Retries 10
```

若被拒（CI 抢先推送数据），按 AGENTS.md 处理：

```bash
git fetch origin main
git merge origin/main --no-edit
# 生成文件冲突一律取远端，然后重跑生成器
git checkout --theirs data/star-growth.json trending.json recent.json data/changes.json data/changes-feed.json
node tools/build-growth.mjs
git add data/star-growth.json trending.json recent.json data/changes.json data/changes-feed.json
git commit --no-edit
pwsh -NoProfile -File '.\tools\push.ps1' -Retries 10
```

- [ ] **Step 7: 确认 Pages 部署**

```powershell
$c = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
$tok = ($c -split "`n" | Where-Object { $_ -like 'password=*' }) -replace '^password=',''
$h = @{ Authorization = "Bearer $tok"; Accept = "application/vnd.github+json"; "User-Agent" = "dsh" }
(Invoke-RestMethod -Uri "https://api.github.com/repos/Daninelli/opensource-market/pages/builds/latest" -Headers $h) |
  Select-Object commit, status, created_at
```

Expected: `status` 为 `building` 或 `built`，`commit` 为本次推送的 SHA。

---

## 附：验收对照

| 规格验收标准 | 对应任务 |
| --- | --- |
| 1. 生成器能产出、count=1699、可算增量 1698 | Task 1 Step 2-3 |
| 2. 打开页面见 1699 行，首行为最大增量，末行为 null | Task 4 Step 4、Task 7 Step 4 |
| 3. 点「工具」剩 1085 行；搜 agent 全命中 | Task 7 Step 4 |
| 4. 点行跳详情页正常 | Task 7 Step 4 |
| 5. 375px 不溢出、不重叠 | Task 7 Step 4 |
| 6. `check-data.mjs` 通过 | Task 7 Step 3 |
| 7. CI 含生成步骤且纳入自动提交 | Task 6 Step 3 |
