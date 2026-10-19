# 开源集市 · 数据字段规范（DATA FORMAT v2）

> 本文档是 `projects.json` 的**唯一字段权威定义**，同时覆盖即将上线的 **Gitee 入口**扩展字段。
> 任何新增 / 修改项目数据、以及后续开发 Gitee 入口时，都以本文档为准。
> 配套校验规则：`REQUIRED` 必填清单见 `tools/check-data.mjs`，本文档与其保持同步。

- 维护人：@Daninelli
- 版本：v2.0（含 Gitee 扩展）
- 数据文件：`projects.json`（纯静态站点唯一数据源）
- 归档数据：`projects-candidates.json`（待人工审核的候选池，不直接被站点读取）

---

## 1. 顶层结构

`projects.json` 最外层必须是 **JSON 数组**，每个元素是一个项目对象：

```json
[
  { "name": "Medusa", "repo": "medusajs/medusa", "...": "..." }
]
```

> ⚠️ 数组内**不允许重复 `repo`**（`tools/check-data.mjs` 会直接报错）。

---

## 2. 分类字段（一级 / 二级）

分类的权威定义在 `app.js` 的 `TAXONOMY`，`tools/check-data.mjs` 有同步副本。**两处必须同时改**。

### 2.1 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `category` | string | 是 | 一级分类**中文名**，必须与 `category_slug` 严格对应 |
| `category_slug` | string | 是 | 一级分类英文 slug，只能取下表 11 个值 |
| `subcategory` | string | 建议 | 二级分类**中文名**，必须与 `subcategory_slug` 严格对应 |
| `subcategory_slug` | string | 建议 | 二级分类英文 slug，见下表 |

> `check-data.mjs` 会校验 `category === label` 和 `subcategory === label`，**中英文名写错会直接导致自检失败**。

### 2.2 一级 / 二级分类总表（11 个一级）

| `category_slug` | `category` | 二级分类（`subcategory_slug` = `subcategory`） |
| --- | --- | --- |
| `ecommerce` | 电商 | `headless` 无头电商 · `storefront` 电商前端 · `platform` 平台商城 |
| `game` | 游戏 | `engine` 游戏引擎 · `client` 游戏客户端 |
| `social` | 社交 | `microblog` 微博客 · `im` 即时通讯 · `forum` 论坛社区 |
| `finance` | 金融 | `personal-finance` 个人财务 · `investment` 投资管理 |
| `education` | 教育 | `lms` 在线学习 · `interactive` 互动课程 |
| `medical` | 医疗 | `emr` 电子病历 |
| `enterprise` | 企业服务 | `admin` 后台管理 · `low-code` 低代码平台 · `bi` 数据分析 · `collaboration` 团队协作 |
| `media` | 内容媒体 | `cms` 建站与 CMS · `streaming` 影音媒体 |
| `tool` | 工具 | `design` 设计工具 · `notes` 笔记工具 · `photos` 相册管理 · `backend` 后端服务 · `automation` 自动化 · `monitoring` 运维监控 · `devtools` 开发工具 · `utility` 效率工具 |
| `government` | 政务 | `participation` 公众参与 · `open-data` 开放数据 |
| `other` | 其他 | `smart-home` 智能家居 · `sync` 私有同步 · `system` 系统工具 · `documents` 文档归档 |

### 2.3 二级分类增补规则（重要）

新增二级分类必须**三处同步**，否则校验会失败：

1. `app.js` 的 `TAXONOMY` 对应一级分类 `children` 里加一行
2. `tools/check-data.mjs` 的 `TAXONOMY` 加同一行
3. `tools/merge-candidates.mjs` 的 `TAXONOMY` 加同一行
4. 最后在 `projects.json` 里引用新 slug

### 2.4 已落地的二级分类扩展（25 → 51 个）

本次调研把二级分类从 25 个扩到 **51 个**，以下均已在上述三处同步完成：

| 一级分类 | 新增 slug | 中文名 | 落位项目 |
| --- | --- | --- | --- |
| `social` | `collab-suite` | 加密协作 | Cryptpad |
| `social` | `calendar` | 日历与日程 | Rallly |
| `finance` | `accounting` | 记账核算 | Akaunting、Invoice Ninja、GnuCash |
| `finance` | `payment` | 支付网关 | （待补） |
| `education` | `lab` | 实验与科研记录 | （待补） |
| `medical` | `imaging` | 医疗影像 | cBioPortal |
| `medical` | `practice` | 诊所与实验室 | OpenBoxes |
| `enterprise` | `crm` | 客户关系 | EspoCRM、Twenty |
| `enterprise` | `erp` | 企业资源 | ERPNext、Odoo |
| `enterprise` | `docs` | 文档与知识库 | BookStack、Outline |
| `media` | `ebook` | 电子书与阅读 | Stump、Calibre-Web |
| `media` | `podcast` | 播客与音频 | AzuraCast |
| `tool` | `security` | 安全与密码 | Vaultwarden、Keycloak |
| `tool` | `file` | 文件管理与网盘 | Cloudreve、Filestash |
| `tool` | `devops` | 运维部署 | Portainer |
| `tool` | `readlater` | 稍后读与收藏 | wallabag、Karakeep |
| `tool` | `iot` | 物联网 | （待补） |
| `tool` | `media-tool` | 媒体处理 | （待补） |

> 完整 51 个二级分类见 [CATEGORY-GAPS.md](CATEGORY-GAPS.md) 第 3 节。
> 一致性自检：`node tools/check-candidates.mjs` 会校验候选池字段与平台字段；分类三处一致性可人工比对 `TAXONOMY`。

---

## 3. 基础字段（全平台通用）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 展示名称。中文友好名优先（如 `Luanti（原 Minetest）`） |
| `repo` | string | 是 | **主仓库**标识，格式 `owner/repo`。GitHub 项目填 GitHub 路径，Gitee 项目填 Gitee 路径 |
| `note_zh` | string | 是 | 中文简介，卡片正文。**一两句话说清：是什么 / 解决什么问题 / 适合谁** |
| `tech_stack` | string[] | 是 | 技术栈标签，卡片最多展示前 4 个 |
| `deploy_type` | string | 是 | 部署形态，如 `前端源码` / `Docker 部署` / `传统部署 / Docker` / `客户端` / `二进制` |
| `license` | string | 是 | 开源协议，**以仓库 LICENSE 文件为准**（不要凭印象写） |
| `stars` | number | 建议 | star 数，用于卡片统计行与排序 |
| `updated_at` | string(ISO) | 建议 | 最近更新时间 ISO8601，卡片显示「x 天前」 |
| `kind` | string | 否 | **交付形态**，与分类正交。取值见 3.1，缺省按 `app` |

### 3.1 `kind` 形态字段

分类回答「这个项目是干什么用的」，`kind` 回答「它以什么形式交付」。两者正交：同一个「框架」属性可以出现在「企业服务/低代码」或「工具/智能体」下。

| 值 | 含义 | 卡片展示 |
| --- | --- | --- |
| `app` | 可安装/可自托管的完整应用（默认值，不必显式写） | 不显示徽标 |
| `client` | 桌面端 / 移动端客户端 | 显示「客户端」徽标 |
| `cli` | 命令行工具 | 显示「命令行」徽标 |
| `framework` | 框架 / 平台 / 低代码 / 脚手架 | 显示「框架」徽标 |
| `library` | 库 / SDK / 组件包 | 显示「库 / SDK」徽标 |
| `skill` | Agent 技能包 / 提示词 / 配置集 | 显示「技能包」徽标 |

> 校验：`tools/check-data.mjs` 会校验 `kind` 必须在上述枚举内（缺省不报错，按 `app` 统计）。
> 展示：`app.js` 只对非 `app` 形态渲染徽标，避免污染卡片。

> `check-data.mjs` 的 `REQUIRED = ["name","repo","category","category_slug","tech_stack","deploy_type","note_zh","license"]`

---

## 4. 下载相关字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `default_branch` | string | 否 | 主分支名，用于拼 codeload 源码 zip |
| `download_url` | string | 否 | **源码下载直链**。留空则前端回退到 `repo` 首页。GitHub 项目通常是 `https://codeload.github.com/<owner>/<repo>/zip/refs/heads/<branch>` |
| `release` | object | 否 | 最新 Release 信息，见 4.1 |
| `best_assets` | object[] | 否 | 从 Release 里挑出的「安装包」候选，见 4.2 |

### 4.1 `release` 对象

```json
{
  "tag": "v13.2.4",
  "name": "13.2.4",
  "published": "2026-10-13T11:41:03Z",
  "url": "https://github.com/grafana/grafana/releases/tag/v13.2.4",
  "assets": [
    {
      "name": "grafana_13.2.4_amd64.deb",
      "size": 380538600,
      "url": "https://github.com/grafana/grafana/releases/download/v13.2.4/grafana_13.2.4_amd64.deb",
      "downloads": 415
    }
  ]
}
```

| 子字段 | 类型 | 说明 |
| --- | --- | --- |
| `tag` | string | Release tag，前端显示为版本号 |
| `name` | string | Release 标题 |
| `published` | string | 发布时间 ISO8601 |
| `url` | string | Release 页面 URL |
| `assets[].name` | string | 附件文件名 |
| `assets[].size` | number | 附件字节数（`formatSize()` 会转成 MB/GB） |
| `assets[].url` | string | 附件下载直链 |
| `assets[].downloads` | number | 下载次数 |

### 4.2 `best_assets` 对象（卡片「下载应用」按钮用）

```json
[
  {
    "name": "Godot_v4.7.2-stable_win64.exe.zip",
    "size": 86013866,
    "url": "https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_win64.exe.zip",
    "platform": "Windows"
  }
]
```

| 子字段 | 类型 | 取值 / 说明 |
| --- | --- | --- |
| `name` | string | 附件文件名 |
| `size` | number | 字节数 |
| `url` | string | 直链 |
| `platform` | enum | `Windows` / `macOS` / `Linux` / `Android` / `通用` / `其他平台` |

> 前端行为：`best_assets.length > 1` 才渲染平台下拉选择器；为 0 时按钮置灰显示「无官方包」，提示自行构建或 Docker 部署。挑选规则见 `tools/pick-installers.mjs`。

---

## 5. Gitee 入口扩展字段（下一阶段）

> 站点当前只有 GitHub 入口：`app.js` 里 `repoUrl = "https://github.com/" + project.repo` 是硬编码。
> 为了平滑接入 Gitee，**先按下面规范把数据写进 `projects.json`**，前端再做兼容渲染。
> 设计原则：**老字段语义不变**，新增字段全部是「可选 + 有默认值」，这样老数据零改动也能跑。

### 5.1 新增字段总表

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `platform` | string | 否 | 见 5.2 | 项目主平台，决定仓库链接指向哪里 |
| `gitee_repo` | string | 否 | `null` | Gitee 仓库 `owner/repo`。**项目只存在于 Gitee 时也填这里** |
| `gitee_url` | string | 否 | 由 `gitee_repo` 推导 | Gitee 仓库完整 URL |
| `gitee_stars` | number | 否 | `null` | Gitee star 数 |
| `gitee_updated_at` | string | 否 | `null` | Gitee 最近推送时间 ISO8601 |
| `github_mirror` | string\|null | 否 | `null` | GitHub 镜像仓库完整 URL，没有镜像填 `null` |
| `mirror_note` | string | 否 | `null` | 镜像说明，如 `GitHub 为官方同步镜像，更新延迟 1~3 天` |

### 5.2 `platform` 取值

| 值 | 含义 | 前端行为 |
| --- | --- | --- |
| `github` | 仅 GitHub（现有 57 个项目应批量补上） | 仓库按钮链接 `https://github.com/<repo>` |
| `gitee` | 仅 Gitee | 仓库按钮链接 `gitee_url`，按钮文案改为「Gitee」 |
| `both` | GitHub + Gitee 双仓库 | 渲染**两个**仓库按钮，分别指向两边 |
| 缺省 | 无该字段 | **按 `repo` 是否能在 GitHub 打开判断，默认等同 `github`**（向后兼容） |

### 5.3 三种典型数据形态（示例）

**A. 纯 GitHub 项目（现有数据，补一个 `platform` 即可）**

```json
{
  "name": "Medusa",
  "platform": "github",
  "repo": "medusajs/medusa",
  "download_url": "https://codeload.github.com/medusajs/medusa/zip/refs/heads/master",
  "gitee_repo": null,
  "gitee_url": null,
  "github_mirror": null
}
```

**B. 纯 Gitee 国产项目**

```json
{
  "name": "mall",
  "platform": "gitee",
  "repo": "macrozheng/mall",
  "gitee_repo": "macrozheng/mall",
  "gitee_url": "https://gitee.com/macrozheng/mall",
  "gitee_stars": 65000,
  "gitee_updated_at": "2026-10-15T08:20:11+08:00",
  "github_mirror": null,
  "download_url": "https://gitee.com/macrozheng/mall/repository/archive/master.zip",
  "stars": null
}
```

> Gitee 源码 zip 直链格式：`https://gitee.com/<owner>/<repo>/repository/archive/<branch>.zip`

**C. 双平台项目（GitHub 为主 + Gitee 镜像，或反之）**

```json
{
  "name": "RuoYi-Vue-Pro",
  "platform": "both",
  "repo": "YangFong/RuoYi-Vue-Pro",
  "gitee_repo": "yangzhiyuan/RuoYi-Vue-Pro",
  "gitee_url": "https://gitee.com/yangzhiyuan/RuoYi-Vue-Pro",
  "gitee_stars": 12000,
  "github_mirror": "https://github.com/YangFong/RuoYi-Vue-Pro",
  "mirror_note": "Gitee 为主要维护仓库，GitHub 为同步镜像"
}
```

### 5.4 前端渲染兼容（给后续开发的约束）

1. `repo` 字段继续作为**主仓库标识**，不改变含义
2. `stars` 若无值，卡片统计行显示 `0`（现有行为），建议改为：**Gitee 项目读 `gitee_stars`，双平台取两边较大值**
3. `download_url` 优先，为空时：GitHub 项目跳 `https://github.com/<repo>`，Gitee 项目跳 `gitee_url`
4. 仓库按钮文案从硬编码 `GitHub` 改为按 `platform` 动态生成
5. `check-data.mjs` 需要放宽：`platform === "gitee"` 时，`repo` 允许纯 Gitee 路径（当前正则已支持 `owner/repo`，但需增加「Gitee 项目必须填 `gitee_url`」的校验）

---

## 6. 完整字段示例（一个项目把所有字段都用上）

```json
{
  "name": "Grafana",
  "platform": "github",
  "repo": "grafana/grafana",
  "gitee_repo": null,
  "gitee_url": null,
  "github_mirror": null,
  "category": "企业服务",
  "category_slug": "enterprise",
  "subcategory": "数据分析",
  "subcategory_slug": "bi",
  "tech_stack": ["Go", "React", "TypeScript"],
  "deploy_type": "Docker / 二进制",
  "note_zh": "监控与可观测性看板的事实标准，对接 Prometheus、Loki 等数据源，做运维监控和指标展示的首选。",
  "license": "AGPL-3.0",
  "default_branch": "main",
  "download_url": "https://codeload.github.com/grafana/grafana/zip/refs/heads/main",
  "stars": 77332,
  "updated_at": "2026-10-16T09:12:00Z",
  "release": {
    "tag": "v13.2.4",
    "name": "13.2.4",
    "published": "2026-10-13T11:41:03Z",
    "url": "https://github.com/grafana/grafana/releases/tag/v13.2.4",
    "assets": [{ "name": "grafana_13.2.4_amd64.deb", "size": 380538600, "url": "https://...", "downloads": 415 }]
  },
  "best_assets": [
    { "name": "grafana_13.2.4_amd64.deb", "size": 380538600, "url": "https://...", "platform": "Linux" }
  ]
}
```

---

## 7. 数据采集流水线（本次实际使用）

```
发现阶段（Playwright 真实浏览器）
   GitHub：https://github.com/search?q=<关键词>&type=repositories&s=stars&o=desc
   Gitee ：https://gitee.com/explore/all   +   https://gitee.com/<owner>/<repo>
        ↓
精确字段阶段（HTTP API，准且不触发验证码）
   GitHub：GET https://api.github.com/repos/<owner>/<repo>
           → stargazers_count / license.spdx_id / default_branch / pushed_at
           GET https://api.github.com/repos/<owner>/<repo>/contents/<LICENSE>
           → 读取 LICENSE 文件首行，确认 NOASSERTION 项目的真实协议
   Gitee ：GET https://gitee.com/api/v5/repos/<owner>/<repo>
           → full_name / description / language / stargazers_count / license / html_url / pushed_at
        ↓
候选池：projects-candidates.json（人工审核）
        ↓
校验：node tools/check-candidates.mjs
        ↓
合入：node tools/merge-candidates.mjs --write（自动去重 + 备份）
        ↓
复核：node tools/check-data.mjs
```

### 7.1 GitHub 搜索页提取选择器（已验证可用）

| 目标 | 选择器 |
| --- | --- |
| 结果条目 | `[data-testid="results-list"] > div` |
| 仓库链接 | `.search-title a` → `href` 形如 `/owner/repo` |
| 英文描述 | `.Content__agXLbn` |
| 主语言 | `.footerItem__UC05DZ span[aria-label$="language"]` |
| star 数 | `a[href$="/stargazers"]` 的 `aria-label`（形如 `"554157 stars"`） |

### 7.2 Gitee 提取选择器（已验证可用）

| 目标 | 选择器 |
| --- | --- |
| 结果条目 | `.explore-repo__list-item` |
| 仓库链接 | `a.project-namespace-path` → `href` 形如 `/owner/repo` |
| 描述 | `[class*="desc"]` |
| 主语言 | `[class*="language"]` |

> ⚠️ Gitee 网页会被「安全验证码」拦截（HTTP 405），遇到时改用 Gitee API + 已知仓库路径。
> ⚠️ Gitee 的 `api/v5/search/repositories` 匿名搜索返回空数组，**不可靠**；仓库详情接口 `api/v5/repos/<owner>/<repo>` 会 403 限流，建议配 token。

---

## 8. 校验与发布流程

```powershell
# 1. 候选池自检（字段齐全 / platform 自洽 / 重复仓库 / license 是否确认）
node tools/check-candidates.mjs

# 2. 合并候选池到 projects.json（先干跑看清单，确认后加 --write）
node tools/merge-candidates.mjs            # 干跑，只打印将新增哪些
node tools/merge-candidates.mjs --write    # 真正写入（自动备份 + 按 repo 去重）

# 3. 数据自检（分类 slug / 必填字段 / owner-repo 格式 / 重复仓库）
node tools/check-data.mjs

# 4. 抓取 star 与更新时间（复用 Playwright，避开 GitHub API 配额限制）
node tools/fetch-repo-data.mjs            # 只补缺失项
node tools/fetch-repo-data.mjs --all      # 全量重抓

# 5. 抓 Release 并挑各平台安装包
node tools/fetch-releases.mjs
node tools/pick-installers.mjs            # 具体参数见脚本头部注释
```

`check-candidates.mjs` / `check-data.mjs` 通过时分别输出 `[OK] 候选池检查通过` / `[OK] 数据检查通过`。
