# AI 画布工作台（ai-canvas-studio）

节点式 AI 画布：在无限画布上摆放文本与图片节点，用连线表达「谁是谁的参考素材」，
每个节点自带独立的 AI 对话框，直接完成文生图 / 图生图，结果写回节点。

## 功能

- 画布：选择工具、抓手工具、网格吸附、点阵背景、迷你地图
- 节点：文本节点 / 图片节点 / 参考图片节点，双击编辑文本、点击或拖拽上传图片、拖拽调整大小
- 连线：节点四向连接点，箭头指向的节点消费参考（文本节点提供提示词，图片节点提供参考图）
- 编辑：撤销 / 重做（上限 100 步）、删除选中（Delete）、清空画布（工具栏最底部，二次确认）
- 对齐：左 / 右 / 水平居中 / 顶 / 底 / 垂直居中（多选后出现对齐条）
- 右键菜单：空白处加节点（含参考图片节点）、全选、导出 JSON；节点上删除、填写提示词、断开连线、复制
- AI：每个节点底部自带提示词输入框和「AI 生成」按钮，就地输入、就地生成，结果写回本节点；
  参考素材来自入边连线；文生图、图生图、文本改写；提示词随画布一起保存
- 反复生成：节点上已经有结果时，再点「AI 生成」默认在它上面接着改 —— 图片当作底图做「按指令改图」，
  文字当作底稿做「在原文上改」，所以提示词写成「把背景换成夜晚」这类就行；
  节点底部的「基于当前图修改」开关关掉，就是丢掉底图从头重画一张。
  生成记录不落盘，只保留最新这一张，草稿不会越用越大
- 参考图：普通节点底部还有一格「＋ 参考图」，放一张图当参考，生成结果不会覆盖它；
  参考图片节点则整块都是参考素材，点「AI 生成到新节点」时结果落到旁边的新图片节点
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

打开 `/settings` 填：供应商（模拟 / OpenAI 兼容）、Base URL、API Key、图片模型、图改图模型、文本模型、默认尺寸，
点「测试连接」验证。配置只存在这台设备的浏览器里，不会写入数据库。

`图片模型` 负责「从零画一张」，`图改图模型` 负责「带底图改图」—— 也就是节点上已经有图片、
或者那次生成是「基于当前图修改」时走的模型。留空按老规矩自动挑（文生图模型名里带 `t2i`
就自动换成 `wanx2.1-imageedit`）；节点还没有图、从零开始生成时仍然用 `图片模型`。

> 万相这条改图链路（`/services/aigc/image2image/image-synthesis`）实测只吃 `wanx2.1-imageedit`：
> `wan2.2-imageedit`、`qwen-image-edit-plus`、`wan2.5-i2i-preview` 都会被拒或要求另一套参数。
> 这一格主要是留给自建网关 / 代理用的。

内置三种供应商预设，选中后会自动填好地址与模型名（可再手改）：

| 预设 | Base URL | 图片模型 | 图改图模型 | 文本模型 |
| --- | --- | --- | --- | --- |
| 模拟模式 | — | — | — | — |
| OpenAI 兼容接口 | `https://api.openai.com/v1` | `gpt-image-1` | `gpt-image-1` | `gpt-4o-mini` |
| 通义千问 · 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `wanx2.1-t2i-turbo` | `wanx2.1-imageedit` | `qwen-plus` |

只要在 API Key 里开始输入内容，供应商会自动从"模拟模式"切到 OpenAI 兼容协议，避免"填了 Key 却还在跑占位图"。

OpenAI 兼容协议下：无参考图走 `POST {baseUrl}/images/generations`，
有参考图走 `POST {baseUrl}/images/edits`（multipart，多图按 `image[]`），
文本走 `POST {baseUrl}/chat/completions`。要接别家协议时，只需扩展 `src/lib/ai/provider.ts`。

图片模型填 `qwen-image-*`（例如 `qwen-image-3.0` 配 `qwen-image-edit-plus`）时，文生图和图改图都改走
多模态同步接口：`POST {origin}/api/v1/services/aigc/multimodal-generation/generation`，
一次请求直接返回图片，不用提交任务再轮询。文生图发 `content: [{ text }]`（带 `prompt_extend`，
让模型把提示词扩写饱满），图改图发 `content: [{ image }, { text }]`，底图排在最前面。
这条接口没有万相那条 1800 字的提示词限制 —— 实测 6000 字也照收，所以画布上直接连长篇剧本没问题，
节点上也不会再出现「参考信息只带前 1800 字」的提示。

出图尺寸跟着「默认图片尺寸」走，`qwen-image` 这两条实测 1328²/1664²/2048² 都能出
（1664² 约 3.7MB、2048² 约 5MB）。图越大画布越重：超过 6MB 的图不内联，会留成会过期的临时链接，
所以别超过 2048²。云端的 `projects.graph` 是直接存整段 base64 的，图多图大时上传会明显变慢。

通义千问（阿里云百炼）说明：官方 `compatible-mode` **不提供** `/images/generations`（实测返回 404），
所以出图走百炼的原生异步接口——`POST {origin}/api/v1/services/aigc/text2image/image-synthesis`
提交任务，再轮询 `GET {origin}/api/v1/tasks/{task_id}`，成功后把图片取回并内联成 data URL；
文本仍走 `compatible-mode` 的 `/chat/completions`。

带参考图时改走「万相-通用图像编辑」：`POST {origin}/api/v1/services/aigc/image2image/image-synthesis`，
`function` 固定用 `description_edit`（按指令改图），参考图以 Base64 Data URL 直接放在 `base_image_url`
里（官方文档支持 Base64，所以画布上的图不需要先传到公网）。此时若图片模型还是文生图模型
（名字里带 `t2i`），会自动换成 `wanx2.1-imageedit`；已经在设置里选了图像编辑模型就沿用。多张参考图
只把第一张当编辑底图，其余仍会作为文本参考参与提示词。

改图接口对提示词长度比文生图敏感得多：实测 1800 字正常、1900 字起百炼直接返回
`submit algo service error, Internal server error!`（300 / 600 / 1000 / 1500 / 1700 都试过，都好）。
所以走改图时提示词会被压到 1800 字以内（先保住用户自己写的那句指令，剩下的额度留给连线带来的
参考信息），节点底部会写明「参考信息只带前 1800 字」。接了长篇剧本当参考的节点，靠这条限制才不会翻车。

参考图在浏览器里会先缩放到 512~4096 像素之间（百炼对输入图的要求），再存成 data URL 跟着画布保存，
所以不依赖 Supabase 登录，也不会像签名 URL 那样过期。

## 图片存在哪

画布里的图（上传的素材、生成的结果、节点自带的参考图）体积都很大，一张 1024×1024 的图 base64
就有一两 MB，全塞进 localStorage 会直接撑爆 5MB 配额（表现为控制台
`QuotaExceededError ... ai-canvas:draft`，界面却还显示「已保存到本地」）。

所以本地草稿分两处存：

- **IndexedDB**（库名 `ai-canvas`，表 `images`）：图片本体，配额几百 MB，同一张图按内容指纹去重。
- **localStorage**（键 `ai-canvas:draft`）：画布结构，图片位置只留一个 `idb:` 开头的引用；小于 16KB 的图
  （比如模拟模式的占位 SVG）仍然内联，导出的单文件 JSON 依然自带图片。

读草稿时会把引用换回 data URL；图片本体找不到时该字段清空，不会留下坏地址。写草稿失败（比如真的写满）
会把标题栏改成「保存失败，请重试或保存到云端」，不再假装已保存。

## 部署到 Vercel

1. 导入仓库，Root Directory 选 `ai-canvas-studio`。
2. 环境变量填 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
3. 把线上域名（含 `https://<domain>/auth/callback`）加入 Supabase 的重定向白名单。

## 部署到 Cloudflare（Workers）

线上地址形如 `https://<worker>.<子域>.workers.dev`，代码从 GitHub 自动构建。
仓库里已经带好配置，不用改代码：

| 文件 | 作用 |
| --- | --- |
| `wrangler.jsonc` | 入口指向 `.open-next/worker.js`、开 `nodejs_compat`、静态资源走 assets |
| `open-next.config.ts` | OpenNext 的 Cloudflare 适配器配置 |
| `package.json` 的 `cf:build` / `cf:preview` / `cf:deploy` | 本地构建 / 预览 / 手动部署 |

> Next 16 只能用 `@opennextjs/cloudflare`，老的 `@cloudflare/next-on-pages` 不支持。

### 首次部署（Cloudflare 控制台）

1. Workers & Pages → Create → **Connect GitHub** → 授权后选中本仓库。
2. 建项目时填：

   | 项 | 值 |
   | --- | --- |
   | Project name | `ai-canvas-studio`（要和 `wrangler.jsonc` 里的 `name` 一致） |
   | 生产分支 | `main` |
   | Root directory（在 Advanced settings 里） | `/ai-canvas-studio` |
   | Build command | `pnpm cf:build` |
   | Deploy command | `npx wrangler deploy` |
   | Build variables | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` |

3. 部署完把 `https://<worker>.<子域>.workers.dev` 设为 Supabase 的 Site URL，并把
   `https://<worker>.<子域>.workers.dev/auth/callback` 加进 Redirect URLs
   （`http://localhost:3000/auth/callback` 留着，方便本地开发）。

### 踩过的坑（照做，别改回去）

- **别只往 `package.json` 加依赖而不更新 lockfile**：Cloudflare 装依赖用
  `pnpm install --frozen-lockfile`，两边对不上会直接构建失败。本地网络装不动时可以用
  `pnpm install --lockfile-only --registry=https://registry.npmmirror.com` 只重算 lockfile。
- **新增带安装脚本的依赖要同时加进 `pnpm-workspace.yaml` 的 `allowBuilds`**，否则 pnpm 会以
  `ERR_PNPM_IGNORED_BUILDS` 让整个安装失败（wrangler 会带进 `esbuild` 和 `workerd`，两个都已放行）。
- **构建命令就写 `pnpm cf:build`，别再加 `&& pnpm install`**：Cloudflare 会先自己装一遍依赖。
- **构建经常要排队**（实测光是初始化就要 6 分钟）。失败时点构建详情里的 **Download log** 看完整日志 ——
  页面上显示的日志是截断的，真正的报错往往在后面。

### 更新线上版本

推 `main` 就自动重新构建部署：

```bash
git push origin main
```

### 本地预览与手动部署（可选）

```bash
pnpm cf:build      # 生成 .open-next/worker.js
pnpm cf:preview    # 本地起一个接近线上的环境
pnpm cf:deploy     # 直接部署（需先 wrangler login）
```

> 浏览器的 localStorage 按域名隔离，`localhost` 和线上域名不共享：线上第一次用要重新在
> 「AI 设置」里填一次供应商、模型与 Key。

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
