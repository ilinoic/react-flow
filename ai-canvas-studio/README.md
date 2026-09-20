# AI 画布工作台（ai-canvas-studio）

节点式 AI 画布：在无限画布上摆放文本与图片节点，用连线表达「谁是谁的参考素材」，
每个节点自带独立的 AI 对话框，直接完成文生图 / 图生图，结果写回节点。

## 功能

- 画布：选择工具、抓手工具、网格吸附、点阵背景、迷你地图
- 节点：添加文本节点 / 图片节点、双击编辑文本、点击或拖拽上传图片、拖拽调整大小
- 连线：节点四向连接点，箭头指向的节点消费参考（文本节点提供提示词，图片节点提供参考图）
- 编辑：撤销 / 重做（上限 100 步）、删除选中（Delete）、清空画布（工具栏最底部，二次确认）
- 对齐：左 / 右 / 水平居中 / 顶 / 底 / 垂直居中（多选后出现对齐条）
- 右键菜单：空白处加节点、全选、导出 JSON；节点上删除、用此图生成、断开连线、复制
- AI：每个节点一个对话框，参考素材来自入边连线；文生图、图生图、文本改写
- 自定义 API：供应商、Base URL、API Key、模型、尺寸全部可配置；未配置时走模拟模式
- 持久化：本地草稿自动保存（1.5 秒防抖）、保存到云端、`/projects` 管理画布
- 导出：画布 JSON（`canvas-<名称>-<时间>.json`）

## 本地启动

```bash
pnpm install
# 复制 .env.example 为 .env.local 并填两个变量
pnpm dev            # http://localhost:3000
pnpm test           # 单元测试
pnpm typecheck      # 类型检查
pnpm lint           # 代码检查
```

环境变量：

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

> 本机注意：这台机器的 `%APPDATA%` / `%LOCALAPPDATA%` 卷不支持原子重命名（EXDEV），
> 直接跑 `next dev` 会报 `EXDEV ... config.json`。启动前把这两个变量指到工作区目录即可：
>
> ```powershell
> $env:APPDATA="D:\react flow\.tools\appdata"
> $env:LOCALAPPDATA="D:\react flow\.tools\localappdata"
> pnpm dev
> ```

## Supabase 初始化

1. 打开 Supabase 控制台 → SQL Editor，粘贴执行 [`supabase/schema.sql`](./supabase/schema.sql)
   （建 `projects` 表 + 行级安全策略 + 私有图片桶 `canvas-images`）。
2. Authentication → Sign In / Providers → Email：确认已开启，`Confirm email` 保持开启。
3. Authentication → URL Configuration：
   - `Site URL` 设为 `http://localhost:3000`
   - `Redirect URLs` 加入 `http://localhost:3000/auth/callback`
4. 打开 `/signup` 用真实邮箱注册，收信点确认链接后即可登录。

## 自定义 AI 接口

打开 `/settings` 填：供应商（模拟 / OpenAI 兼容）、Base URL、API Key、图片模型、文本模型、默认尺寸，
点「测试连接」验证。配置只存在这台设备的浏览器里，不会写入数据库。

内置三种供应商预设，选中后会自动填好地址与模型名（可再手改）：

| 预设 | Base URL | 图片模型 | 文本模型 |
| --- | --- | --- | --- |
| 模拟模式 | — | — | — |
| OpenAI 兼容接口 | `https://api.openai.com/v1` | `gpt-image-1` | `gpt-4o-mini` |
| 通义千问 · 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `wanx2.1-t2i-turbo` | `qwen-plus` |

只要在 API Key 里开始输入内容，供应商会自动从"模拟模式"切到 OpenAI 兼容协议，避免"填了 Key 却还在跑占位图"。

OpenAI 兼容协议下：无参考图走 `POST {baseUrl}/images/generations`，
有参考图走 `POST {baseUrl}/images/edits`（multipart，多图按 `image[]`），
文本走 `POST {baseUrl}/chat/completions`。要接别家协议时，只需扩展 `src/lib/ai/provider.ts`。

## 部署到 Vercel

1. 导入仓库，Root Directory 选 `ai-canvas-studio`。
2. 环境变量填 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
3. 把线上域名（含 `https://<domain>/auth/callback`）加入 Supabase 的重定向白名单。

## 端到端测试

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
$env:E2E_EMAIL="<测试账号>"; $env:E2E_PASSWORD="<密码>"
pnpm exec playwright test
```

没有提供账号时用例会跳过登录段；AI 请求在测试里被打桩，不消耗真实额度。

## 目录结构

```
src/app          页面与 API 路由（canvas / login / signup / settings / projects / api/ai/generate）
src/components   auth / ai / canvas（工具栏、右键菜单、对齐条、节点、AI 面板）
src/lib/canvas   类型、状态仓库与历史、参考解析、对齐、序列化、上传、草稿
src/lib/ai       供应商类型、设置读写、服务端适配层、参考图转换
src/lib/supabase 浏览器/服务端客户端与会话刷新（src/proxy.ts）
supabase         建表脚本
```

## 常见问题

- **收不到确认邮件**：检查 Supabase 的 Email 模板与发信额度；也可在登录页用「邮箱魔法链接」。
- **图片显示不出来**：图片存在私有桶，节点里用的是 1 小时签名 URL；重新上传或刷新页面即可。
- **生成报 401 / 502**：401 多为未登录或 Key 失效，502 是上游接口报错，面板里会显示上游原文。
- **对齐条不出现**：需要选中 2 个以上节点（Shift 点选或框选）。
