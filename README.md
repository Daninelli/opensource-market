# 开源集市

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

按分类整理的开源成品应用导航站，用于学习、开发、交流。

- 纯 HTML + CSS + 原生 JS，无框架、无构建步骤
- 数据全部放在 `projects.json`，新增项目只改这一个文件
- 可直接部署到 GitHub Pages / Vercel / Netlify / 任意静态服务器

线上地址：<https://daninelli.github.io/opensource-market/>

## 收录一个新项目

不用懂 Git，也不用改任何文件。

打开 [New issue](https://github.com/Daninelli/opensource-market/issues/new?template=submit.yml)，选「**收录开源项目**」表单，填四项（项目名、仓库地址、一级分类、一句话简介）即可。

提交后 Action 会自动从 GitHub 拉取 star 数、最近更新时间、开源协议、最新 Release 与安装包，校验通过后创建收录 PR，由维护者审核合并。详细流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 快速开始

本地预览**不要直接双击 `index.html`**。浏览器出于安全策略禁止 `file://` 页面用 `fetch` 读取同目录 JSON，会看到「数据没有加载出来」。用任意静态服务器打开即可：

```bash
npx serve .          # 或
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 目录结构

```
.
├── index.html              # 页面结构 + SVG 图标精灵（全部自绘，不用 emoji）
├── app.js                  # 分类体系、分区渲染、筛选、搜索、热门榜
├── assets/site.css         # 全部样式
├── assets/recent.js        # 最近收录页脚本
├── projects.json           # 项目数据（站点唯一数据源）
├── projects-candidates.json# 候选池：待审核的新项目，站点不直接读取
├── meta.json               # 数据刷新时间（由脚本自动生成）
├── trending.json           # 热门榜（由脚本按 star 增量生成）
├── data/stars-history.json # star 每日快照（保留 30 天）
├── recent.html             # 最近收录（独立页面，列表 + 表头）
├── licenses.html           # 开源协议说明
├── disclaimer.html         # 免责声明
├── CONTRIBUTING.md         # 如何贡献（新增项目 / 手工置顶）
├── CODE_OF_CONDUCT.md      # 行为准则
├── LICENSE                # 本站代码与数据的开源协议（MIT）
├── tools/
│   ├── fetch-repo-data.mjs  # 抓 star / 更新时间 / 下载直链，并写快照
│   ├── build-trending.mjs  # 生成 trending.json（近 7 天 star 增量）
│   ├── check-data.mjs      # 数据自检（字段、分类、去重、置顶规则）
│   ├── check-candidates.mjs# 候选池自检
│   ├── merge-candidates.mjs# 候选池合并进 projects.json（去重 + 自动备份）
│   ├── fetch-releases.mjs  # 抓 Release 资产
│   ├── pick-installers.mjs # 从 Release 里挑各平台安装包
│   └── push.ps1            # 带重试的推送脚本
└── .github/workflows/
    └── refresh-data.yml    # 每天自动抓数据 → 生成榜单 → 有变化才提交
```

## 页面结构

- **顶部导航**：协议说明 / 免责声明 / 提交项目 / GitHub 仓库
- **Hero 区**：站点名 + 一句话介绍 + 实时统计（项目数 / 分类数 / 可下载数）
- **近期热门**：按近 7 天 star 增量排的 Top 10，置顶项目优先，数据每日更新
- **工具条（吸顶）**：一级分类导航（带项目数，滚动时自动高亮当前分区）+ 搜索（按 `/` 或 `Ctrl/⌘+K` 打开命令面板）
- **内容区**：按一级分类分区展示，每区有二级分类筛选 chip，默认只展示两行，剩余的收在「更多」卡片里

## 分类体系

固定 11 个一级分类：电商 / 游戏 / 社交 / 金融 / 教育 / 医健 / 企业服务 / 内容媒体 / 工具 / 政务 / 其他。

每个一级分类下有若干二级分类（如「电商 → 无头电商 / 电商前端 / 平台商城」）。

分类体系定义在 `app.js` 的 `TAXONOMY`。投稿时只需填写分类中文名，系统会自动转换并校验。

## 数据自动更新

`.github/workflows/refresh-data.yml` 每天 UTC 03:17 自动执行：

```
抓取 star / 更新时间 → 写 meta.json + star 快照 → 生成 trending.json → 校验 → 有变化才提交
```

- API 额度来自 Actions 自带的 `GITHUB_TOKEN`（1000 次/小时，241 个项目绰绰有余）
- 同一份流程可以手动触发：仓库 Actions 页面 → `刷新仓库数据` → `Run workflow`
- 改了 `tools/fetch-repo-data.mjs`、`tools/build-trending.mjs` 或该工作流本身时，推送后也会自动跑一次

### 热门榜怎么算的

GitHub 没有查询「历史 star 数」的接口，`stargazers` 接口又有 400 页（4 万 star）上限，对头部项目直接失效。

所以采用自建快照：每天把每个仓库的 star 存一条到 `data/stars-history.json`，保留 30 天，再对比算出「近 7 天增量」。**开始积累 2 天后上榜，满 7 天后窗口才完整。**

## 图标系统

全部图标为手绘 24×24 线性 SVG，放在 `index.html` 的 `<symbol>` 雪碧图里，描边颜色继承 `currentColor`，**不使用 emoji**。

新增图标时加一个 `<symbol id="icon-xxx">`，用 `<svg class="icon"><use href="#icon-xxx"></use></svg>` 引用。

## 安全

`.githooks/pre-commit` 会拦截提交中的 token、私钥、AKIA 开头的 AWS 密钥。启用方式：

```bash
git config core.hooksPath .githooks
```

`.gitignore` 已屏蔽 `.git-credentials`、`*.pem`、`*.key`、`.env` 等。

## 开源协议

本站的页面源码、样式与项目数据以 **MIT 协议**开源，见 [LICENSE](LICENSE)。

需要注意区分两类协议：

| 对象 | 协议 | 谁定的 |
| --- | --- | --- |
| 本站代码与数据 | MIT | 本站维护者 |
| 收录的第三方项目 | 各自的项目协议 | 各项目作者 |

本站只做收录与外链跳转，不托管、不存储、不分发任何第三方项目的代码或安装包，
因此不构成许可证意义上的「分发」。贡献代码请遵循 [CONTRIBUTING.md](CONTRIBUTING.md)，
参与互动请遵循 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

---

## 免责说明

本站是纯静态页面，只做收录与跳转，**不托管、不存储、不分发**任何第三方项目的代码或安装包。所有下载均跳转至 GitHub / Gitee 官方服务器。

收录项目的代码、商标与文档均归原作者与权利人所有，二次分发或商用前请先阅读对应的开源协议（见 [licenses.html](licenses.html) 与 [disclaimer.html](disclaimer.html)）。