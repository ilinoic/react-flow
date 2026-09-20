# AI 画布工作台（ai-canvas-studio）设计说明书

日期：2026-09-20
状态：待评审

## 1. 背景与目标

做一个「节点式 AI 画布工作台」：用户在无限画布上摆放文本节点与图片节点，用连线表达
「谁是谁的参考素材」，每个节点自带一个独立的 AI 对话框，可以直接在节点上完成
文生图 / 图生图，并把结果写回节点。画布内容可以导出为 JSON，也可以保存到云端账号下。

一句话目标：**节点即素材、连线即上下文、节点自带对话框，一次生成沉淀回画布。**

## 2. 范围

### 2.1 本期要做（Phase 1）

账号体系（Supabase 邮箱注册登录）、无限画布、选择/抓手工具、文本节点、图片节点、
节点连线、网格吸附、撤销/重做、删除选中、清空画布、右键菜单、对齐、上传图片、
拖拽缩放节点、双击编辑文本、节点级 AI 对话框（含连线参考）、文生图、图生图、
自定义 API 配置、导出画布 JSON、云端保存与加载。

### 2.2 本期不做（Phase 2 备选）

多人实时协作、评论、版本历史回溯、模板市场、视频/音频节点、矢量化导出（SVG/PSD）、
导入 JSON（先做导出）、节点分组、图层顺序手动调整、移动端手势适配。

## 3. 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端框架 | Next.js 16（App Router + TypeScript + Turbopack） | 2026-09-20 用 `create-next-app` 官方模板初始化，实际落地 16.3.5 |
| 样式 | Tailwind CSS + shadcn/ui 风格自建组件 | 模板自带 Tailwind |
| 画布引擎 | `@xyflow/react`（React Flow v12） | 节点/连线/缩放/网格吸附原生支持 |
| 状态管理 | `zustand` + 自建快照历史 | 撤销/重做可控、可测试 |
| 后端 | Supabase（Auth + Postgres + Storage） | 邮箱注册登录，RLS 隔离数据 |
| AI | 自定义 API（OpenAI 兼容协议优先） | base URL / Key / 模型名全部可配置 |
| 测试 | Vitest + Testing Library + Playwright | 逻辑层 TDD，关键流程 e2e |

## 4. 架构总览

```
浏览器
 ├─ /login /signup ──► Supabase Auth（邮箱注册 + 邮箱确认 + 会话 Cookie）
 ├─ /canvas
 │    ├─ React Flow 画布（nodes / edges / viewport）
 │    ├─ 画布 store（zustand）→ 快照历史（撤销/重做）
 │    ├─ 节点右键/画布右键菜单、左侧工具栏、对齐条
 │    └─ 节点 AI 对话框 → /api/ai/generate
 └─ /settings（AI 供应商配置，存 localStorage）

Next.js Route Handlers（服务端）
 ├─ /auth/callback                  邮箱确认/魔法链接回跳
 └─ /api/ai/generate                统一生成入口（鉴权后转发到自定义 API）

src/proxy.ts（Next 16 的 middleware 改名）
 └─ 刷新 Supabase 会话 Cookie + 保护 /canvas、/projects、/settings

Supabase
 ├─ Auth：邮箱注册登录
 ├─ Postgres：projects（画布 JSON）、ai_settings（可选）
 └─ Storage：canvas-images（用户私有图片）
```

数据流（生成一次图片）：

```
选中节点 N → 打开 N 的 AI 对话框 → 解析 N 的入边参考（文本/图片）
   → POST /api/ai/generate（prompt + references）
   → 服务端读取用户自定义 API 配置 → 调用文生图/图生图
   → 返回图片 → 写回节点 N.data + 追加一条对话记录 → 进入撤销历史
```

## 5. 账号与安全

- 注册登录方式：**邮箱**。主流程为「邮箱 + 密码」注册，注册后发送确认邮件；
  确认链接通过 `/auth/callback` 完成会话建立。登录页同时提供「邮箱验证码/魔法链接」
  作为备用方式（同一入口，二选一按钮）。
- 会话使用 `@supabase/ssr` 的 Cookie 方案，`src/proxy.ts`（Next 16 里由 middleware 改名而来，
  逻辑在 `src/lib/supabase/session.ts`）保护 `/canvas`、`/projects`、`/settings`。
- 所有表开启 RLS，策略统一为 `user_id = auth.uid()`。
- Storage 桶 `canvas-images` 为私有桶，对象路径强制 `{user_id}/...`，读取使用签名 URL。
- 自定义 API 的 Key **只保存在浏览器 localStorage**，请求时随 HTTPS 发到自家
  `/api/ai/generate`，服务端仅透传、不落库、不写日志。

## 6. 数据模型

### 6.1 Supabase 表

```sql
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '未命名画布',
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy "own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 6.2 画布 JSON（导出/保存的统一格式）

```ts
type CanvasFile = {
  version: 1;
  name: string;
  exportedAt: string;           // ISO
  viewport: { x: number; y: number; zoom: number };
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

type CanvasNode = {
  id: string;
  type: 'text' | 'image';
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: TextNodeData | ImageNodeData;
};

type TextNodeData = {
  kind: 'text';
  text: string;
  ai: AiNodeState;              // 该节点独立的 AI 会话
};

type ImageNodeData = {
  kind: 'image';
  src: string | null;           // 图片 URL（Storage 签名 URL 或 data URL）
  storagePath?: string;         // 私有桶中的路径
  alt: string;
  ai: AiNodeState;
};

type AiNodeState = {
  messages: AiMessage[];        // 该节点自己的对话历史
  status: 'idle' | 'running' | 'error';
  error?: string;
};

type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageSrc?: string;            // assistant 生成图
  createdAt: string;
};

type CanvasEdge = {
  id: string;
  source: string;               // 提供参考的节点
  target: string;               // 消费参考的节点（生成发生在这里）
  type: 'reference';
};
```

### 6.3 连线语义（重要约定）

**边是有向的：`source` 是参考素材，`target` 是消费参考的节点。**
节点 N 的参考 = 所有 `target === N.id` 的边，其 `source` 节点的内容。

- 文本节点作参考 → 提供提示词文本。
- 图片节点作参考 → 提供参考图（图生图）。
- 一个节点可以同时挂多个文本/图片参考。
- 只解析**直接入边**（一层），不递归穿透，避免环形引用带来的不可预期结果。

## 7. 画布交互规格

### 7.1 左侧工具栏（自上而下）

| 位置 | 按钮 | 行为 |
| --- | --- | --- |
| 工具组 | 选择工具 | 指针模式，可框选、拖拽节点 |
| 工具组 | 抓手工具 | 平移画布，不改动节点 |
| 节点组 | 添加文本节点 | 在视口中心新建文本节点并进入编辑 |
| 节点组 | 添加图片节点 | 在视口中心新建图片节点（待上传状态） |
| 编辑组 | 撤销 / 重做 | 历史栈前进后退，无历史时禁用 |
| 编辑组 | 删除选中 | 删除所有选中节点及其连线 |
| **最底部** | **清空画布** | 危险色，二次确认后清空所有节点与连线（可撤销） |

### 7.2 快捷键

| 按键 | 行为 |
| --- | --- |
| `V` / `H` | 切换选择工具 / 抓手工具 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z`、`Ctrl + Y` | 重做 |
| `Delete` / `Backspace` | 删除选中节点（正在编辑文本时不触发） |
| `Esc` | 退出文本编辑 / 关闭右键菜单与 AI 面板 |

### 7.3 节点行为

- **文本节点**：双击进入内联编辑（textarea 自动聚焦），`Esc` 或点击空白处提交；
  右下角拖拽手柄调整大小（最小 120×60）。
- **图片节点**：点击「上传图片」选择文件，或把图片文件拖到节点上；上传成功后显示图片；
  未上传时显示占位与按钮。右下角拖拽手柄调整大小（最小 120×120）。
- **节点连线**：每个节点四向连接点，拖出即为参考边（虚线、带方向箭头）。
- **网格吸附**：背景为点阵网格，吸附步长 16px，拖拽节点时对齐网格。
- **双击空白处**：新建文本节点（快捷手势）。

### 7.4 右键菜单

- **空白处右键**：添加文本节点 / 添加图片节点 / 全选 / 导出画布 JSON。
- **节点右键**：删除节点 / 用此图生成（图片节点，打开该节点 AI 面板并以其为参考）/
  断开全部连线 / 复制节点。

### 7.5 对齐

多选（Shift 点击或框选）≥2 个节点时，画布顶部出现对齐条：
左对齐 / 右对齐 / 水平居中 / 顶对齐 / 底对齐 / 垂直居中。
对齐基准为**选区包围盒**；对齐操作进入撤销历史。单个节点时对齐条隐藏。

### 7.6 撤销/重做边界

- 进入历史的关键动作：新增/删除节点、移动结束、缩放结束、文本内容变更、连线增删、
  对齐、清空画布、AI 生成写回节点。
- 拖拽过程中不产生历史点，仅在 `onNodeDragStop`/`onResizeEnd` 提交一次。
- 历史上限 100 步，超出丢弃最早记录。

## 8. AI 生成规格

### 8.1 节点级 AI 对话框

- 每个节点各自拥有一个面板（右侧抽屉，标题为节点名），内含：参考素材预览区、
  本节点对话历史、提示词输入框、生成按钮、错误重试。
- **对话历史属于节点自身**：保存在 `node.data.ai.messages`，随画布一起保存/导出。
- 图片来源参考在面板中显示缩略图；参考区标注来自哪个节点。
- 图片节点：生成结果直接写入该节点并把 assistant 消息追加到该节点的历史。
- 文本节点：调用文本模型，用参考图/参考文生成或改写文本，回写节点正文。

### 8.2 请求契约（前端 → 自家服务端）

`POST /api/ai/generate`

```jsonc
{
  "mode": "image",                        // "image" | "text"
  "nodeId": "n_1",
  "prompt": "一只戴宇航头盔的柴犬",
  "references": {
    "texts": ["水彩画风格"],
    "images": [{ "name": "n_0", "dataUrl": "data:image/png;base64,..." }]
  },
  "size": "1024x1024",
  "config": {                             // 来自用户的「自定义 API」设置
    "provider": "openai-compatible",
    "baseUrl": "https://api.example.com/v1",
    "apiKey": "sk-...",
    "imageModel": "gpt-image-1",
    "textModel": "gpt-4o-mini"
  }
}
```

响应：`{ "imageSrc": "data:image/png;base64,..." }`（image 模式）
或 `{ "text": "生成后的文本" }`（text 模式）；失败返回 `{ "error": "可读原因" }`。

### 8.3 服务端适配层

- `lib/ai/provider.ts` 暴露两个函数：
  `generateImage(config, { prompt, texts, images, size })`、
  `generateText(config, { prompt, texts, images })`。
- `provider = "openai-compatible"` 时：
  无参考图 → `POST {baseUrl}/images/generations`（JSON）；
  有参考图 → `POST {baseUrl}/images/edits`（`FormData`，多张参考图按 `image[]` 传）。
  文本 → `POST {baseUrl}/chat/completions`。
- `provider = "mock"`：不联网，返回本地生成的占位图/占位文本，用于开发与测试。
- 未配置自定义 API 时自动落到 `mock`，界面明确提示「未配置 API，当前为模拟模式」。

### 8.4 自定义 API 设置页（/settings）

字段：供应商（OpenAI 兼容 / 模拟）、Base URL、API Key、图片模型、文本模型、
图片尺寸默认值。提供「测试连接」按钮（调用 `/api/ai/generate` 的 dry-run）。
配置存 `localStorage`，键名 `ai-canvas:settings`。

## 9. UI 布局

```
┌──────────────────────── 顶栏：项目名 / 保存状态 / 账号菜单 ─────────────────────────┐
├──────┬───────────────────────────────────────────────────────┬────────────────────┤
│ 工具 │                    画布（点阵网格）                    │  节点 AI 面板       │
│ 栏   │  节点 · 连线 · 对齐条 · 右键菜单                        │（按需展开）         │
│      │                                                       │                    │
│ 清空 │                                                       │                    │
└──────┴───────────────────────────────────────────────────────┴────────────────────┘
```

## 10. 错误处理

- 未登录访问受保护路由 → 重定向 `/login?next=...`。
- AI 失败 → 面板内显示错误原因 + 重试按钮，节点状态标记为 `error`，不影响画布其余部分。
- 上传失败 → toast 提示，节点保持原状态。
- 保存失败 → 顶栏显示「保存失败，重试」，本地草稿仍保留在 localStorage。
- 服务端 AI 路由做入参校验（zod），缺少必填字段返回 400 而不是透传到上游。

## 11. 测试策略

- **单元测试（Vitest）**：历史栈（撤销/重做/上限/合并）、参考解析、对齐计算、
  画布序列化与导出、AI 请求构造、设置读写。
- **组件测试（Testing Library）**：工具栏按钮禁用态、右键菜单渲染、AI 面板渲染与提交。
- **端到端（Playwright）**：注册登录 → 新建画布 → 加节点 → 连线 → 模拟生成 →
  导出 JSON；AI 路由用 `page.route` 打桩，测试不依赖真实模型与网络。

## 12. 风险与假设

| 编号 | 假设/风险 | 处理 |
| --- | --- | --- |
| A1 | 项目目录 `D:\react flow\ai-canvas-studio`，用官方模板初始化 | 如需改名/换位置请提出 |
| A1b | 本机 `%APPDATA%`/`%LOCALAPPDATA%` 卷不支持原子重命名（EXDEV） | 运行 `next dev` 前把两个环境变量指到工作区目录 |
| A2 | 登录方式 = 邮箱+密码（含邮箱确认），备用魔法链接 | 若只想魔法链接，可关掉密码入口 |
| A3 | AI 按 OpenAI 兼容协议接入，base URL/Key/模型可自定义 | 其他协议（如 Gemini 原生）后续加适配器 |
| A4 | 参考解析只取直接入边（一层） | 需要穿透多层再改 |
| A5 | API Key 只存浏览器本地，不上传数据库 | 需要跨设备同步再开「保存到账号」 |
| R1 | 安装依赖与浏览器需要联网授权 | 首次安装时请求授权 |
| R2 | Supabase 项目需在控制台执行建表 SQL、开启邮箱登录 | 计划中给出完整 SQL 与步骤 |

## 13. 分期

- **Phase 1（本期计划覆盖）**：第 3–6 章全部内容，可跑通「登录 → 画布 → 连线 → 生成 → 导出/保存」。
- **Phase 2**：导入 JSON、节点复制/分组、历史版本、协作、更多 AI 协议适配、Key 云端加密存储。
