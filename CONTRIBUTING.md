# 参与贡献

感谢你考虑为开源集市贡献内容。

## 提交一个新项目

本站所有项目数据都在 `projects.json`，新增只需改这一个文件。

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