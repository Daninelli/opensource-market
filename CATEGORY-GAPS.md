# 开源集市 · 分类覆盖清单（现状 vs 候选池）

> 统计时间：2026-10-18
> 数据来源：`projects.json`（线上数据，60 个项目）+ `projects-candidates.json`（本次调研候选池，97 个项目）
> 字段规范见 [DATA-FORMAT.md](DATA-FORMAT.md)

---

## 1. 总览

| 指标 | 现状 | 候选池新增 | 合并后 |
| --- | --- | --- | --- |
| 项目总数 | 60 | **+94** | **154** |
| 一级分类 | 11 | — | 11 |
| 二级分类 | 51 | — | 51（本次由 25 扩到 51） |
| **空二级分类** | — | — | **0** ✅ |
| GitHub 项目 | 57 | +91 | 148 |
| 双平台（GitHub + Gitee） | 2 | +3 | 5 |
| 纯 Gitee 项目 | 1 | 0 | 1 |

> 候选池 97 条中，`mall` / `Sa-Token` / `RuoYi` 3 条已存在于 `projects.json`，合并时自动跳过，故实际新增 **94** 条。

---

## 2. 分类覆盖对比

| 一级分类 | 现状 | 候选池新增 | 合并后 | 评价 |
| --- | --- | --- | --- | --- |
| 企业服务 enterprise | 13 | +23 | **36** | 已饱和（CRM / ERP / 文档库 / BI 全覆盖） |
| 工具 tool | 19 | +17 | **36** | 已饱和（含物联网、媒体处理、安全、文件） |
| 社交 social | 3 | +12 | **15** | 大幅改善（IM / 微博客 / 论坛 / 日历） |
| 电商 ecommerce | 6 | +5 | **11** | 良好（补国产商城与前端模板） |
| 内容媒体 media | 4 | +7 | **11** | 良好（CMS / 直播 / 电子书 / 播客） |
| 金融 finance | 3 | +7 | **10** | 显著改善（记账 / 支付 / 投资） |
| 教育 education | 2 | +8 | **10** | **显著改善**（原最薄弱之一） |
| 医疗 medical | 1 | +7 | **8** | **显著改善**（原最薄弱） |
| 游戏 game | 3 | +4 | **7** | 改善（模拟经营类客户端） |
| 政务 government | 2 | +4 | **6** | **显著改善** |
| 其他 other | 4 | 0 | 4 | 稳定（兜底分类，4 个二级分类各 1 个） |

### 本次重点补齐

| 分类 | 变化 |
| --- | --- |
| 医疗 | 1 → 8（电子病历 ×4、医疗影像 ×2、诊所与实验室 ×2） |
| 教育 | 2 → 10（在线学习 ×5、互动课程 ×2、实验记录 ×2、其余 ×1） |
| 社交 | 3 → 15（即时通讯 ×4、微博客 ×3、论坛社区 ×4、日历 ×2、加密协作 ×1） |
| 政务 | 2 → 6 |
| 金融 | 3 → 10（记账核算 ×3、支付网关 ×2、投资管理 ×2、个人财务 ×3） |

---

## 3. 二级分类体系（已扩展，51 个，全部有项目）

本次把二级分类从 25 个扩到 **51 个**，三处定义已同步（`app.js` / `tools/check-data.mjs` / `tools/merge-candidates.mjs`），并有自动校验脚本兜底。**合并后 51 个二级分类全部有项目，无一为空。**

| 一级分类 | 二级分类（slug 中文） |
| --- | --- |
| 电商 `ecommerce` | `headless` 无头电商 · `storefront` 电商前端 · `platform` 平台商城 |
| 游戏 `game` | `engine` 游戏引擎 · `client` 游戏客户端 |
| 社交 `social` | `microblog` 微博客 · `im` 即时通讯 · `forum` 论坛社区 · `collab-suite` 加密协作 · `calendar` 日历与日程 |
| 金融 `finance` | `personal-finance` 个人财务 · `investment` 投资管理 · `accounting` 记账核算 · `payment` 支付网关 |
| 教育 `education` | `lms` 在线学习 · `interactive` 互动课程 · `lab` 实验与科研记录 |
| 医疗 `medical` | `emr` 电子病历 · `imaging` 医疗影像 · `practice` 诊所与实验室 |
| 企业服务 `enterprise` | `admin` 后台管理 · `low-code` 低代码平台 · `bi` 数据分析 · `collaboration` 团队协作 · `crm` 客户关系 · `erp` 企业资源 · `docs` 文档与知识库 |
| 内容媒体 `media` | `cms` 建站与 CMS · `streaming` 影音媒体 · `ebook` 电子书与阅读 · `podcast` 播客与音频 |
| 工具 `tool` | `design` 设计工具 · `notes` 笔记工具 · `photos` 相册管理 · `backend` 后端服务 · `automation` 自动化 · `monitoring` 运维监控 · `devtools` 开发工具 · `utility` 效率工具 · `security` 安全与密码 · `file` 文件管理与网盘 · `devops` 运维部署 · `readlater` 稍后读与收藏 · `iot` 物联网 · `media-tool` 媒体处理 |
| 政务 `government` | `participation` 公众参与 · `open-data` 开放数据 |
| 其他 `other` | `smart-home` 智能家居 · `sync` 私有同步 · `system` 系统工具 · `documents` 文档归档 |

> **改分类三步走**（三处必须同步，否则校验会失败）：
> 1. `app.js` 的 `TAXONOMY`
> 2. `tools/check-data.mjs` 的 `TAXONOMY`
> 3. `tools/merge-candidates.mjs` 的 `TAXONOMY`

---

## 4. 候选池新增项目速览（94 条）

> 完整字段（含 star / license / default_branch / download_url / Gitee 字段）见 `projects-candidates.json`。

### 医疗 medical（+7）
OpenMRS · HospitalRun · LibreHealth EHR · Medplum · cBioPortal · OHIF Viewer · OpenBoxes

### 教育 education（+8）
Open edX · Canvas LMS · Chamilo LMS · OpenOlat · Frappe LMS · BigBlueButton · eLabFTW · OSF

### 社交 social（+12）
Mattermost · Rocket.Chat · Jitsi Meet · Zulip · Misskey · WriteFreely · Flarum · NodeBB · Lemmy · Cryptpad · Radicale · Baikal

### 金融 finance（+7）
Maybe Finance · Akaunting · Invoice Ninja · GnuCash · Hyperswitch · Kill Bill · Portfolio Performance

### 政务 government（+4）
CONSUL Democracy · OpenGovernment · Shareabouts · PortalJS

### 游戏 game（+4）
OpenRCT2 · Veloren · OpenTTD · CorsixTH

### 内容媒体 media（+7）
Strapi · Ghost · Owncast · Stump · Calibre-Web · AzuraCast · Castopod

### 电商 ecommerce（+5）
litemall · newbee-mall · mall-swarm · Medusa Next.js Starter · EverShop

### 工具 tool（+17）
Vaultwarden · Keycloak · Portainer · Gitea · changedetection.io · wallabag · Karakeep · Filestash · Cloudreve · DBeaver · Mealie · Homepage · Heimdall · ThingsBoard · Node-RED · HandBrake · FFmpeg

### 企业服务 enterprise（+23）
EspoCRM · Twenty · ERPNext · Odoo · Leantime · Kanboard · Rallly · Planka · Budibase · Baserow · Directus · Grist · ILLA Builder · JeecgBoot · Lightdash · Evidence · DataEase · PostHog · BookStack · Outline · HedgeDoc · Etherpad · React Admin

---

## 5. Gitee 入口数据准备情况

| 项目 | 状态 |
| --- | --- |
| 数据字段规范 | ✅ `DATA-FORMAT.md` 第 5 节定义 `platform` / `gitee_repo` / `gitee_url` / `gitee_stars` / `gitee_updated_at` / `github_mirror` / `mirror_note` |
| 候选池已带 Gitee 字段 | ✅ 3 个双平台为本次新增：litemall（Gitee 9.0k）、mall-swarm（Gitee 1.9k）、JeecgBoot（Gitee 18.5k） |
| 已有 Gitee 项目 | ✅ `projects.json` 已含 RuoYi / mall / Sa-Token 的 Gitee 或双平台条目 |
| 前端入口 | ✅ 已实现「源切换」开关（见 git 提交 `25cc08b` / `4c550bc`），新增项目按 `platform` 字段自动适配 |
| Gitee 抓取通道 | ⚠️ 网页有验证码（405）、`api/v5/search` 匿名返回空、详情 API 会 403 限流 → 建议后续配 Gitee token |

### 已实测的 Gitee 数据（2026-10-18）

| 项目 | Gitee 路径 | Gitee star | 协议 | 备注 |
| --- | --- | --- | --- | --- |
| mall | `macrozheng/mall` | 27.3K | Apache-2.0 | 已在 projects.json |
| RuoYi | `y_project/RuoYi` | 48.9K | MIT | 已在 projects.json |
| Sa-Token | `dromara/Sa-Token` | 49.5K | Apache-2.0 | 已在 projects.json |
| JeecgBoot | `jeecg/JeecgBoot` | 18.5K | Apache-2.0 | 候选池新增（正确路径是 `jeecg/` 不是 `jeecgboot/`） |
| litemall | `linlinjava/litemall` | 9.0K | MIT | 候选池新增 |
| mall-swarm | `macrozheng/mall-swarm` | 1.9K | Apache-2.0 | 候选池新增 |
| Cloudreve | — | — | GPL-3.0 | ❌ Gitee 无镜像，仅 GitHub |

> 抓取方式：Gitee API 对匿名请求全线 403，改用 Playwright 读取仓库页 `.star-item` 元素拿到真实 star；每个 Gitee URL 都用 HEAD 请求验证过 HTTP 200（据此纠正了 `jeecgboot/JeecgBoot`、`cloudreve/Cloudreve` 两个 404 错误路径）。

---

## 6. 协议需注意的项目（收录前确认）

| 项目 | 协议 | 风险说明 |
| --- | --- | --- |
| Directus | MSCL-1.0-GPL | Monospace 可持续核心许可，非 OSI 认证，商用有规模限制 |
| Outline | BUSL-1.1 | Business Source License，到期后转开源，商用需授权 |
| Akaunting | BUSL-1.1 | 同上，生产使用有额外条款 |
| ThingsBoard | BUSL-1.1 | 同上（常被误标为 Apache-2.0，已核实 LICENSE 原文） |
| Invoice Ninja | ELv2 | Elastic License 2.0，禁止提供托管服务 |
| Planka | PLANKA Community 1.1 | 自定义社区协议，商用需确认 |
| FFmpeg | GPL-2.0 | 默认 LGPL-2.1+，启用 GPL 组件后为 GPL-2.0 |
| Twenty / Odoo / Mattermost / Rocket.Chat / Baserow / Lightdash / PostHog / Strapi | 混合 | 核心开源 + 企业版目录商业授权 |

---

## 7. 后续待办

1. **人工复核**上表商业/混合协议项目
2. 合并候选池：`node tools/merge-candidates.mjs --write`，再跑 `node tools/check-data.mjs`
3. 抓 star / 更新时间：`node tools/fetch-repo-data.mjs`
4. 抓 Release 安装包：`node tools/fetch-releases.mjs` + `node tools/pick-installers.mjs`
5. 配 Gitee token 后精确补 `gitee_stars` / `gitee_updated_at`
6. 补 Gitee 源码包直链（`gitee.com/<owner>/<repo>/repository/archive/<branch>.zip`）
