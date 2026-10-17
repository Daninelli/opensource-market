# 开源集市

一个纯静态的开源成品应用导航站：把「拿来就能用、或者稍微改改就能二次开发」的开源项目集中展示出来，支持**一级分类 + 二级分类**联动筛选。

- 纯 HTML + CSS + 原生 JS，无框架、无构建步骤
- 数据全部放在 `projects.json`，新增项目只改这一个文件
- 可直接部署到 GitHub Pages / Vercel / Netlify / 任意静态服务器

---

## 目录结构

```
opensource-market/
├── index.html          # 页面结构、样式、SVG 图标精灵
├── app.js              # 分类体系 + 分区渲染 + 二级筛选 + 搜索
├── projects.json       # 项目数据（要新增项目改这里）
├── favicon.svg         # 自绘站点图标
├── tools/
│   └── check-data.mjs  # 数据自检脚本（分类、字段、重复仓库）
├── .nojekyll           # 告诉 GitHub Pages 不要用 Jekyll 处理
├── .gitignore
└── README.md
```

---

## 页面结构

- **Hero 区**：站点名 + 一句话介绍 + 实时统计（项目数 / 一级分类数 / 二级分类数 / 可下载数）
- **工具条（吸顶）**：一级分类导航（带项目数，滚动时自动高亮当前分区）+ 搜索框（按 `/` 快速聚焦）
- **内容区**：按**一级分类分区**展示。每个分区有标题、一句说明，以及**二级分类筛选 chip**；卡片按筛选结果实时过滤
- **搜索**：跨项目名 / 简介 / 仓库 / 技术栈 / 分类 / 部署方式 / 协议全文匹配

每张卡片只有一个 **「去 GitHub」** 下载按钮，直达 GitHub 仓库（若数据里提供了 `download_url`，会优先跳到 Release 或归档直链）。本站是纯静态托管，不托管任何项目演示，所以没有演示按钮。

---

## 注意：本地预览不要直接双击 index.html

浏览器出于安全策略，**禁止 `file://` 页面用 fetch 读取同目录的 JSON**，所以直接双击打开会看到「数据没有加载出来」。这不是文件坏了，换一种方式打开即可：

```powershell
# 方式一：Python（本机已装 3.13）
cd C:\Users\personal\Desktop\opensource-market
python -m http.server 8000
# 然后浏览器访问 http://localhost:8000
```

```powershell
# 方式二：Node
npx serve .
```

方式三：VS Code 安装 **Live Server** 插件 → 右键 `index.html` → Open with Live Server。

---

## 发布到 GitHub Pages

1. 在 GitHub 新建仓库（例如 `opensource-market`），**不要**勾选自动创建 README。
2. 在本目录执行：

```powershell
git remote add origin https://github.com/<你的用户名>/opensource-market.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**：
   - Source 选 **Deploy from a branch**
   - Branch 选 **main**，目录选 **/ (root)**
   - 点 **Save**
4. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/opensource-market/`。

> 国内访问 `github.io` 可能不稳定，如果打不开可以绑定自定义域名，或者顺手部署一份到 Vercel / Netlify / Cloudflare Pages（整个文件夹拖上去就行）。

---

## 分类体系（一级 / 二级）

一级分类固定在下面 11 个，二级分类按需扩展。**分类的权威定义在 `app.js` 顶部的 `TAXONOMY`**，`tools/check-data.mjs` 里有一份同步副本用于校验。

| 一级分类（slug） | 二级分类（slug） |
| --- | --- |
| 电商 `ecommerce` | 无头电商 `headless`、电商前端 `storefront`、平台商城 `platform` |
| 游戏 `game` | 游戏引擎 `engine`、游戏客户端 `client` |
| 社交 `social` | 微博客 `microblog`、即时通讯 `im`、论坛社区 `forum` |
| 金融 `finance` | 个人财务 `personal-finance`、投资管理 `investment` |
| 教育 `education` | 在线学习 `lms`、互动课程 `interactive` |
| 医疗 `medical` | 电子病历 `emr` |
| 企业服务 `enterprise` | 后台管理 `admin`、低代码平台 `low-code`、数据分析 `bi`、团队协作 `collaboration` |
| 内容媒体 `media` | 建站与 CMS `cms`、影音媒体 `streaming` |
| 工具 `tool` | 设计工具 `design`、笔记工具 `notes`、相册管理 `photos`、后端服务 `backend`、自动化 `automation`、运维监控 `monitoring`、开发工具 `devtools`、效率工具 `utility` |
| 政务 `government` | 公众参与 `participation`、开放数据 `open-data` |
| 其他 `other` | —（未归类项目兜底） |

> 想加新分类：在 `app.js` 的 `TAXONOMY` 里加一个 `{ slug, label, icon, children }`，同时在 `tools/check-data.mjs` 的 `TAXONOMY` 里加一行，再在 `projects.json` 里引用新 slug 即可。

---

## 图标系统（全部自绘，不用 emoji）

页面里没有任何 emoji 字符，所有图形都是手绘的 **24×24 线性 SVG**，定义在 `index.html` 顶部的 `<svg class="icon-sprite">` 里，用 `<use href="#icon-xxx">` 引用：

| 图标 id | 用途 |
| --- | --- |
| `icon-market` | 站点 Logo（集市摊位） |
| `icon-cart` / `icon-gamepad` / `icon-chat` / `icon-money` / `icon-cap` / `icon-medical` / `icon-building` / `icon-media` / `icon-tool` / `icon-landmark` / `icon-grid` | 11 个一级分类图标（依次对应电商、游戏、社交、金融、教育、医疗、企业服务、内容媒体、工具、政务、其他） |
| `icon-download` / `icon-external` | 卡片按钮：去 GitHub 下载 / 在线演示 |

约定：

- 统一 `viewBox="0 0 24 24"`、`stroke-width: 1.8`、圆角端点与连接
- 颜色一律 `currentColor`，图标会跟随文字颜色（筛选按钮选中时自动变白）
- 尺寸用 `font-size` 控制（`.icon` 宽高为 `1em`），不用为每个位置单独写尺寸
- 新增图标：在精灵里加一个 `<symbol id="icon-xxx" viewBox="0 0 24 24">`，JS 里用 `iconMarkup("xxx")` 引用

`favicon.svg` 是同一套摊位图形的独立文件版本，浏览器标签页图标也用它。

---

## 如何新增一个开源项目

打开 `projects.json`，在数组里追加一个对象（注意用英文逗号分隔，最后一项后面不要加逗号）：

```json
{
  "name": "项目名称",
  "repo": "GitHub 用户名/仓库名",
  "category": "工具",
  "category_slug": "tool",
  "subcategory": "开发工具",
  "subcategory_slug": "devtools",
  "tech_stack": ["Vue 3", "TypeScript"],
  "deploy_type": "Docker 部署",
  "note_zh": "一两句话说清楚：它是什么、解决什么问题、适合谁用。",
  "license": "MIT",
  "download_url": ""
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 展示名称 |
| `repo` | 是 | GitHub 仓库，格式 `owner/repo`，下载按钮默认跳这里 |
| `category` | 是 | 一级分类中文名，必须与 `category_slug` 对应 |
| `category_slug` | 是 | 一级分类英文 slug，见上表 |
| `subcategory` | 建议 | 二级分类中文名，必须与 `subcategory_slug` 对应 |
| `subcategory_slug` | 建议 | 二级分类英文 slug，见上表 |
| `tech_stack` | 是 | 技术栈标签，字符串数组（卡片最多展示 4 个） |
| `deploy_type` | 是 | 部署形态：前端源码 / Docker 部署 / 传统部署 / 二进制 等 |
| `note_zh` | 是 | 中文简介，卡片正文 |
| `license` | 是 | 开源协议，**请以仓库 LICENSE 文件为准** |
| `download_url` | 否 | 想直接给 Release / 归档 zip 链接时填；留空或删除则跳仓库首页 |

### 改完记得自检

```powershell
node tools/check-data.mjs
```

它会检查 JSON 语法、必填字段、分类 slug 是否存在于分类体系、`owner/repo` 格式、是否有重复仓库，并打印各分类的项目数量。全部通过会输出 `[OK] 数据检查通过`。

---

## 后续可以加的功能

- 按 star 数排序（可配合 GitHub Action 定时抓取仓库 star / 更新时间）
- 深色模式
- 收藏 / 稍后看（存 localStorage）

---

## 凭据安全（重要）

推送代码需要的 GitHub token **绝对不要写进仓库里的任何文件**。本项目为此做了三层防护：

### 1. `.gitignore` 已屏蔽

```
.git-credentials
*git-credentials
*.pem
*.key
.env
.env.local
```

### 2. 提交前自动拦截

`.githooks/pre-commit` 会扫描暂存区，发现 GitHub token、AWS Access Key、私钥头就**直接拒绝提交**。

启用（每台机器只需一次）：

```powershell
git config core.hooksPath .githooks
```

### 3. 凭据存在系统凭据管理器

```powershell
git config credential.helper wincred
```

token 会存进 Windows 凭据管理器，不会在磁盘上留明文文件。首次 `git push` 时输入一次用户名和 token，之后自动复用。

> 如果之前存过明文文件 `~/.git-credentials`，可以删掉：
> `Remove-Item "$env:USERPROFILE\.git-credentials" -Force`

### 万一还是提交了 token

1. **立刻去 GitHub 撤销该 token**（Settings → Developer settings → Personal access tokens）
2. 从历史中清除：
   ```powershell
   git filter-branch --force --index-filter "git rm --cached --ignore-unmatch <文件路径>" --prune-empty -- --all
   git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
   git reflog expire --expire=now --all && git gc --prune=now --aggressive
   git push --force origin main
   ```
3. 如果推送时被 GitHub 的 Push Protection 拦截，**不要**谎报成 false positive，应选择「I'll fix it later」并按要求撤销 token。

---

## 免责说明

本项目仅做索引与展示，收录项目的代码、文档、商标均归各自作者所有；商用或二次分发前请自行确认对应开源协议的约束（尤其是 AGPL / GPL / LGPL / MPL / BSL / Sustainable Use License）。
