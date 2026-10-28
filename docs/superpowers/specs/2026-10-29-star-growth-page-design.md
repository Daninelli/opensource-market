# 涨星榜页面设计（全量按 7 天 star 增量排序）

日期：2026-10-29
状态：已确认，待实施

## 背景

热门榜（`trending.json`）只输出 Top 20，且需要人工置顶来撑榜。2026-10-29 取消了全部置顶与推荐位后，榜单完全由真实 star 增量决定。

同时 `data/stars-history.json` 已积累 12 天快照，实测覆盖情况：

| 指标 | 数值 |
| --- | --- |
| 项目总数 | 1699 |
| 能算出 7 天增量的 | 1698（仅 `y_project/RuoYi` 因序列含 null 算不出） |
| 上涨 | 1614 |
| 持平 | 39 |
| 下跌 | 45 |
| 增量中位数 / 均值 | +32 / +237 |
| 7 天全站合计增长 | 401,992 star |

即：**几乎全部项目都有真实增量数据**，值得单独做一个可按增量浏览全量项目的页面。

## 目标

给用户一个入口，能按「近 7 天 star 增量」浏览**全部 1699 个项目**，并支持按分类筛选、按关键词搜索。

## 非目标（YAGNI）

明确不做以下内容：

- 不做排序方式切换（固定增量倒序）
- 不做涨幅百分比列
- 不做分页 / 无限滚动
- 不做 URL 状态同步（筛选条件不进 hash）
- 不做 30 天增量（历史仅 12 天，算不出）
- 不改动现有 `trending.json` 的产出逻辑与首页热门榜形态

## 架构

新增 4 个文件（其中 1 个是生成产物），改动 3 处。

| 文件 | 类型 | 作用 |
| --- | --- | --- |
| `tools/build-growth.mjs` | 新增 | 生成器，产出全量榜 JSON |
| `data/star-growth.json` | 新增（产物） | 页面数据源，约 249KB（紧凑格式） |
| `growth.html` | 新增 | 页面骨架，含 SVG 图标精灵 |
| `assets/growth.js` | 新增 | 渲染与交互 |
| `.github/workflows/refresh-data.yml` | 改动 | 增加生成步骤 + 纳入自动提交 |
| 各页顶栏 / 页脚 + `assets/site.css` | 改动 | 导航入口 + 样式 + 版本号 |

### 数据流

```
projects.json ─┐
               ├─→ tools/build-growth.mjs ─→ data/star-growth.json ─→ assets/growth.js ─→ growth.html
data/stars-history.json ─┘
```

派生文件独立生成，**不塞进 `trending.json`**：热门榜只需 Top 20，涨星榜需全量 1699，合并会让首页每次多下载约 230KB。首页性能不受影响。

## 数据契约

`data/star-growth.json`：

```json
{
  "generated_at": "2026-10-29T03:10:00.000Z",
  "window_days": 7,
  "history_days": 12,
  "count": 1699,
  "items": [
    {
      "repo": "webadderallorg/Recordly",
      "name": "Rea",
      "category": "工具",
      "category_slug": "tool",
      "subcategory": "开发工具",
      "stars": 399458,
      "delta7": 47676
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `generated_at` | string | 生成本文件的时间（ISO） |
| `window_days` | number | 增量窗口天数，固定 7；历史不足时按实际可用天数降级 |
| `history_days` | number | 快照实际天数 |
| `count` | number | `items` 长度 |
| `items[].repo` | string | 仓库全名，用于拼详情页链接 |
| `items[].name` | string | 项目名 |
| `items[].category` / `category_slug` | string | 一级分类中文名 / slug |
| `items[].subcategory` | string \| null | 二级分类中文名 |
| `items[].stars` | number \| null | 当前 star 总数 |
| `items[].delta7` | number \| null | 窗口内 star 增量；算不出为 `null` |

### 排序规则

1. `delta7` 倒序
2. `delta7` 为 `null` 的排最后
3. 增量相同时按 `stars` 倒序
4. `stars` 也相同时按 `repo` 字典序，保证输出稳定（避免每次生成产生无意义 diff）

### 生成器逻辑

```
读 projects.json、data/stars-history.json
for each project:
    values = series[repo]
    if values 长度 < window+1 或 首尾任一端非 number → delta7 = null
    else delta7 = values[last] - values[last-window]
按上述规则排序
写 data/star-growth.json（紧凑 JSON，无缩进，控制体积）
打印统计：总数 / 可算增量数 / 上涨数 / 持平数 / 下跌数
```

窗口天数降级：若 `history_days - 1 < 7`，则 `window_days` 取 `history_days - 1`，并在页面副标题标注「数据积累中（已记录 N 天）」。当前 12 天，走正常分支。

## 页面结构

```
┌─────────────────────────────────────────┐
│ 顶栏（与其他页一致，含「涨星榜」入口）     │
├─────────────────────────────────────────┤
│ 涨星榜                                   │
│ 按近 7 天 star 增量排序 · 数据更新于 X    │
├─────────────────────────────────────────┤
│ [全部1699][工具1085][企业服务202][其他99]… │  分类 chip
│ [🔍 搜索项目名或仓库]                     │  搜索框
├─────────────────────────────────────────┤
│ 1  Rea              工具    +47,676 399.4k│
│    webadderallorg/Recordly                │
│ 2  VoiceStudio    企业服务  +12,622  92.1k│
│ …                                        │
├─────────────────────────────────────────┤
│ 共 1699 个 ｜ 站点总计 1699 ｜ 更新于 X    │
└─────────────────────────────────────────┘
```

### 每行字段

名次 / 项目名 + 仓库全名 / 一级分类 / 7 天增量 / 总 star。

- 名次：**全站排名，不随筛选或搜索重新编号**。筛选到「工具」后看到的是 1、2、5、9… 这样保留真实排位，便于判断项目在全站的位置。1–3 名复用热门榜的 `r1`/`r2`/`r3` 高亮样式
- 增量为正：显示 `+47,676`，绿色（沿用 `#15803d` / `--brand` 系）
- 增量为 0：灰色
- 增量为负：显示 `-12`，红色系
- 增量为 `null`：显示「—」
- 总 star：沿用 `formatCount`（≥10000 显示 `x.xk`）

### 分类分布（chip 数据来源）

工具 1085 / 企业服务 202 / 其他 99 / 内容媒体 90 / 社交 56 / 游戏 46 / 金融 36 / 教育 28 / 电商 27 / 医健 22 / 政务 8。

chip 从 `items` 现算，不写死，避免分类变动后对不上。

## 交互

| 交互 | 行为 |
| --- | --- |
| 点分类 chip | 只显示该分类；再点「全部」复位 |
| 搜索框输入 | 按 `name` 或 `repo` 做不区分大小写的子串匹配 |
| 筛选 + 搜索 | 两条件同时生效（AND） |
| 点整行 | 跳 `detail.html?repo=<urlencoded repo>`（与首页热门榜一致，详情页有 Star 趋势图可接着看） |

搜索输入加 120ms 防抖；每次筛选一次性拼 HTML 字符串再赋给 `innerHTML`，不逐条 append，避免 1699 行重排卡顿。

副标题与页脚里的「数据更新于 X」一律取 `generated_at` 格式化到「YYYY-MM-DD HH:mm」。

## 边界处理

| 情况 | 表现 |
| --- | --- |
| 增量算不出（当前 1 个） | 增量列「—」，排最后 |
| 搜索 / 筛选无结果 | 显示「没有匹配的项目」空状态 |
| JSON 加载失败 | 显示错误信息，页面不白屏 |
| 历史不足 7 天 | 副标题标注实际窗口天数与「数据积累中」 |
| 增量全为 0（冷启动首日） | 正常显示 0，不做特殊处理 |

## CI 接入

在 `.github/workflows/refresh-data.yml` 中：

1. 在「生成最近收录」之后增加步骤：
   ```yaml
   - name: 生成涨星榜
     run: node tools/build-growth.mjs
   ```
2. 把 `data/star-growth.json` 加入「有变化就提交」步骤的 `git add` 列表，以及判断是否有变化的 `git diff --quiet` 文件列表。

不做这一步的话，页面数据不会每天更新。

## 导航接入

- 顶栏 `.topnav-links`：在「最近收录」之后加「涨星榜」
- 页脚 `.footer-links`：同样位置加一条
- 涉及页面：`index.html`、`detail.html`、`recent.html`、`changes.html`、`licenses.html`、`disclaimer.html`、`growth.html`（自身高亮可选）

## 样式与版本号

- 新增 `.growth-*` 前缀样式，复用现有 token（圆角 16/8/6、`--brand`、`--ink`/`--ink-soft`/`--muted`/`--faint`、间距 4 的倍数）
- 图标一律用 `growth.html` 内 `<symbol>` 的手绘 24×24 线性 SVG，**不用 emoji、不引第三方库**
- 按 AGENTS.md 铁律第 2 条：改 `site.css` 后升所有页面 `site.css?v=`；`assets/growth.js` 自带 `?v=`

## 验收标准

1. `node tools/build-growth.mjs` 能生成 `data/star-growth.json`，`count` 为 1699，可算增量数 1698
2. 打开 `growth.html` 能看到 1699 行，首行是增量最大的项目，末行是 `delta7` 为 `null` 的项目
3. 点「工具」chip 后只剩 1085 行；搜索 "agent" 结果全部命中名称或仓库名
4. 点任意一行能跳到对应详情页且正常渲染
5. 手机宽度（375px）下布局不溢出、列不重叠
6. `node tools/check-data.mjs` 通过
7. CI 的 `refresh-data.yml` 包含生成步骤，且 `data/star-growth.json` 在自动提交列表内
