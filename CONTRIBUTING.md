# 参与贡献

感谢你考虑为开源集市贡献内容。

## 方式一：提交项目收录（推荐）

不用懂 Git，也不用改任何文件。

打开仓库的 [New issue](https://github.com/Daninelli/opensource-market/issues/new/choose)，
选「**收录开源项目**」表单，填四项即可：

| 字段 | 说明 |
| --- | --- |
| 项目名称 | 上游仓库的显示名 |
| 仓库地址 | `owner/repo` 格式，必须公开可访问 |
| 所属一级分类 | 中文名，取下面 11 个之一 |
| 一句话简介 | 50 字以内，**自己写**，不要复制上游 README |

一级分类可选值：

```
电商  游戏  社交  金融  教育  医疗  企业服务  内容媒体  工具  政务  其他
```

二级分类**选填**。拿不准可以留空，维护者会在审核时帮你归类；
如果填了但该分类下没有这个细分类，Action 会把该一级分类下所有可选项列在 Issue 里。

提交后会自动发生这些事：

1. Action 从 GitHub 拉取 star 数、最近更新时间、开源协议、最新Release 与安装包
2. 校验仓库可访问、是否重复收录、分类是否合法、简介长度
3. 校验通过 → 自动创建收录 PR，并在 Issue 里贴出链接
4. 维护者审核 diff 后合并，Issue 自动关闭

**star、更新时间、协议、安装包这些都由系统自动获取，作者不需要填，也不应该自己编。**

如果校验没通过（比如仓库不存在、已经收录过），Issue 里会写明原因。

## 方式二：直接改 projects.json

适合维护者本人或熟悉 git 的贡献者。字段含义见 [DATA-FORMAT.md](DATA-FORMAT.md)。

### 1. 准备字段

在数组里加一条，字段含义见 [DATA-FORMAT.md](DATA-FORMAT.md)：

```json
{
  "name": "项目名",
  "repo": "owner/repo",
  "category": "工具",
  "category_slug": "tool",
  "subcategory": "开发工具",
  "subcategory_slug": "devtools",
  "tech_stack": ["TypeScript", "React"],
  "deploy_type": "Docker",
  "note_zh": "一句话简介，建议控制在 50 字以内",
  "license": "MIT"
}
```

要求：

- `category` / `subcategory` 必须与 `app.js` 里 `TAXONOMY` 的定义完全一致
- `note_zh` **自己写**，不要复制上游 README 的原文
- 收录标准：本身是开源项目，有明确 LICENSE，公开可访问

### 2. 自检

```bash
node tools/check-data.mjs
```

会校验字段完整性、分类 slug、仓库重复、置顶数量等。有问题会直接指出行号。

### 3. 提 PR

在 [Issues](https://github.com/Daninelli/opensource-market/issues) 里先开
一个 issue 描述你打算收录的项目，确认分类合适后再提 PR，避免白写。

## 手工置顶某个项目

在对应的项目上加这几个字段：

```json
{
  "name": "项目名",
  "pinned": true,
  "pin_label": "推荐",
  "pin_note": "推荐理由，鼠标悬停显示",
  "pin_until": "2026-12-31"
}
```

| 字段 | 说明 | 必填 |
| --- | --- | --- |
| `pinned` | 是否置顶 | ✅ |
| `pin_label` | 徽章文字，默认「置顶」，最多 6 字 | ❌ |
| `pin_note` | 推荐理由，最多 40 字 | ❌ |
| `pin_until` | 到期日，过期自动失效 | 建议填 |

规则：**全站最多 5 个置顶**。校验脚本会拦截超限的提交。

## 本地预览

浏览器禁止 `file://` 页面用 `fetch` 读 JSON，必须用静态服务器：

```bash
npx serve .
# 或
python -m http.server 8000
```

## 数据多久更新一次

`.github/workflows/refresh-data.yml` 每天 UTC 03:17 自动抓取 star 数和
最近更新时间并提交。**所以你不需要手动改 `stars` 和 `updated_at`。**

## 行为准则

参与即表示同意 [行为准则](CODE_OF_CONDUCT.md)。