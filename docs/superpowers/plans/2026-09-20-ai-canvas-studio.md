# AI 画布工作台（ai-canvas-studio）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可运行的 Next.js 应用：邮箱注册登录 + 节点式 AI 画布（文本/图片节点、连线参考、每节点独立 AI 对话框、文生图/图生图、对齐、撤销重做、导出 JSON、自定义 API）。

**Architecture:** Next.js App Router 负责页面与 AI 转发路由；画布由 React Flow 渲染，状态集中在 zustand store（自带快照历史，实现撤销/重做）；Supabase 提供邮箱账号、画布数据持久化与私有图片存储；AI 通过「自定义 API 适配层」调用，默认 OpenAI 兼容协议，开发与测试用 mock 模式。

**Tech Stack:** Next.js 15（App Router / TypeScript / Tailwind）、@xyflow/react v12、zustand、@supabase/supabase-js + @supabase/ssr、zod、Vitest + Testing Library、Playwright、pnpm。

**Spec:** [docs/superpowers/specs/2026-09-20-ai-canvas-studio-design.md](../specs/2026-09-20-ai-canvas-studio-design.md)

## Global Constraints

- 项目目录：`D:\react flow\ai-canvas-studio`（源码在 `src/`，路径别名 `@/*`）。
- 包管理器：`pnpm`（本机 pnpm 11；npm 不在 PATH 上）。
- 实际落地版本（2026-09-20）：Next.js **16.3.5**（App Router + Turbopack）、React 19.2、Tailwind 4、TypeScript 5.9、zod 4、Vitest 5。
- **Next 16 变更**：`middleware.ts` 已更名为 `src/proxy.ts`（导出 `proxy` 函数），会话刷新逻辑放在 `src/lib/supabase/session.ts`。
- **本机环境约束**：`%APPDATA%` / `%LOCALAPPDATA%` 卷不支持原子重命名（EXDEV），跑 `next dev` 前需把这两个环境变量指到工作区目录内。
- Node：v24（Codex 运行时自带）。
- Supabase URL：`https://dbohemvfauczrwwxbvul.supabase.co`，publishable key：`sb_publishable_7XOj52Fz4BVzGrB96_iOWA_f_fSSOxv`。
- 环境变量名固定：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- 登录方式：邮箱（密码 + 邮箱确认为主，魔法链接为备）。
- 连线语义：`source` 提供参考，`target` 消费参考；只解析直接入边。
- 网格吸附步长固定 `16`；历史栈上限固定 `100`。
- 对齐枚举固定：`left | right | centerX | top | bottom | centerY`。
- 本地设置键固定：`ai-canvas:settings`；本地草稿键固定：`ai-canvas:draft`。
- 面向用户的文案用中文；代码标识符与文件名用英文。
- 每个任务结束时都要跑一次 `pnpm test` 并提交一次 commit。

---

## 文件结构总览

```
ai-canvas-studio/
  .env.local / .env.example            环境变量
  supabase/schema.sql                  建表 + RLS + Storage 策略
  vitest.config.mts / vitest.setup.ts  Vitest 配置
  playwright.config.ts                 端到端测试配置
  src/
    proxy.ts                           会话刷新 + 路由保护（Next 16 由 middleware 改名）
    app/
      layout.tsx  page.tsx  globals.css
      login/page.tsx  signup/page.tsx  settings/page.tsx
      canvas/page.tsx  projects/page.tsx
      auth/callback/route.ts  auth/signout/route.ts
      api/ai/generate/route.ts
    components/
      auth/AuthForm.tsx
      ai/AiSettingsForm.tsx
      canvas/CanvasWorkspace.tsx         画布外壳（工具栏 + React Flow + 面板）
      canvas/CanvasToolbar.tsx           左侧工具栏（最底部为清空画布）
      canvas/CanvasContextMenu.tsx       空白处右键菜单
      canvas/NodeContextMenu.tsx         节点右键菜单
      canvas/AlignmentBar.tsx            对齐条
      canvas/NodeAiPanel.tsx             节点级 AI 对话框
      canvas/UploadImageButton.tsx
      canvas/edgeTypes.ts                参考边样式
      canvas/nodes/TextNode.tsx
      canvas/nodes/ImageNode.tsx
    lib/
      supabase/client.ts  supabase/server.ts  supabase/middleware.ts
      auth/validation.ts
      canvas/types.ts  canvas/store.ts  canvas/graph.ts  canvas/alignment.ts
      canvas/serialization.ts  canvas/constants.ts  canvas/upload.ts  canvas/localDraft.ts
      ai/types.ts  ai/settings.ts  ai/provider.ts  ai/image.ts
      projects/api.ts
```

---

### Task 1: 项目骨架与工具链

**Files:**
- Create: `ai-canvas-studio/`（`create-next-app` 官方模板生成的整棵目录）
- Create: `ai-canvas-studio/vitest.config.ts`、`ai-canvas-studio/vitest.setup.ts`
- Create: `ai-canvas-studio/src/lib/canvas/constants.ts`
- Modify: `ai-canvas-studio/package.json`（脚本）

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `pnpm dev` 与 `pnpm test`；常量 `GRID_SIZE = 16`、`HISTORY_LIMIT = 100`、`MIN_NODE_SIZE`、`DEFAULT_NODE_SIZE`

- [ ] **Step 1: 用官方模板初始化项目（需要联网授权）**

```powershell
cd "D:\react flow"
pnpm dlx create-next-app@latest ai-canvas-studio --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack --yes
```

Expected: 终端出现 `Success! Created ai-canvas-studio`，目录中出现 `src/app/page.tsx`、`package.json`、`tsconfig.json`。

- [ ] **Step 2: 清理模板自带的嵌套 git 仓库**

```powershell
if (Test-Path "D:\react flow\ai-canvas-studio\.git") { Remove-Item -Recurse -Force "D:\react flow\ai-canvas-studio\.git" }
Test-Path "D:\react flow\ai-canvas-studio\.git"
```

Expected: 最后一条输出 `False`（只保留外层 `D:\react flow\.git` 一个仓库）。

- [ ] **Step 3: 安装运行期依赖**

```powershell
cd "D:\react flow\ai-canvas-studio"
pnpm add @xyflow/react zustand @supabase/supabase-js @supabase/ssr zod
```

Expected: `dependencies` 中出现这 5 个包。

- [ ] **Step 4: 安装测试依赖**

```powershell
cd "D:\react flow\ai-canvas-studio"
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom vite-tsconfig-paths
```

Expected: `devDependencies` 中出现这些包。

- [ ] **Step 5: 写 Vitest 配置**

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

`vitest.setup.ts`：

```ts
import '@testing-library/jest-dom/vitest';
```

`package.json` 的 `scripts` 增加三条：

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 6: 写第一批常量**

`src/lib/canvas/constants.ts`：

```ts
export const GRID_SIZE = 16;
export const HISTORY_LIMIT = 100;
export const MIN_NODE_SIZE = {
  text: { width: 120, height: 60 },
  image: { width: 120, height: 120 },
} as const;
export const DEFAULT_NODE_SIZE = {
  text: { width: 240, height: 120 },
  image: { width: 240, height: 240 },
} as const;
```

- [ ] **Step 7: 验证工具链**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test; pnpm typecheck
```

Expected: `pnpm test` 提示没有测试文件（Vitest 已生效）；`pnpm typecheck` 无错误。

- [ ] **Step 8: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "chore: scaffold next.js app with canvas toolchain"
```

---

### Task 2: Supabase 云端资源与邮箱登录开关

**Files:**
- Create: `ai-canvas-studio/supabase/schema.sql`
- Create: `ai-canvas-studio/.env.local`、`ai-canvas-studio/.env.example`

**Interfaces:**
- Consumes: Task 1 的目录
- Produces: 表 `public.projects`；私有存储桶 `canvas-images`；环境变量 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 1: 写建表与存储策略 SQL**

`supabase/schema.sql`：

```sql
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '未命名画布',
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

insert into storage.buckets (id, name, public)
values ('canvas-images', 'canvas-images', false)
on conflict (id) do nothing;

drop policy if exists "own canvas images" on storage.objects;
create policy "own canvas images" on storage.objects
  for all
  using (bucket_id = 'canvas-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'canvas-images' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: 在 Supabase 控制台执行 SQL**

浏览器打开 `https://supabase.com/dashboard/project/dbohemvfauczrwwxbvul/sql/new`，
粘贴 `schema.sql` 全文并执行。

Expected: 无报错；`Table Editor` 中出现 `projects`；`Storage` 中出现私有桶 `canvas-images`。

- [ ] **Step 3: 开启邮箱登录方式**

`Authentication → Sign In / Providers → Email`：确认 `Enable Email provider` 已开启、
`Confirm email` 保持开启（默认）。`Authentication → URL Configuration` 中把 `Site URL`
设为 `http://localhost:3000`，并把 `http://localhost:3000/auth/callback` 加入 `Redirect URLs`。

Expected: 登录设置页显示 Email 已启用，重定向白名单包含回调地址。

- [ ] **Step 4: 写环境变量**

`.env.local`：

```
NEXT_PUBLIC_SUPABASE_URL=https://dbohemvfauczrwwxbvul.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_7XOj52Fz4BVzGrB96_iOWA_f_fSSOxv
```

`.env.example` 用同样的键名、值留空。确认 `.gitignore` 已包含 `.env*.local`。

- [ ] **Step 5: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "chore: add supabase schema and env template"
```

---

### Task 3: 邮箱注册登录与路由保护

**Files:**
- Create: `src/lib/supabase/client.ts`、`src/lib/supabase/server.ts`、`src/lib/supabase/session.ts`
- Create: `src/proxy.ts`（Next 16 用 proxy 取代 middleware）
- Create: `src/lib/auth/validation.ts`、`src/lib/auth/validation.test.ts`
- Create: `src/components/auth/AuthForm.tsx`
- Create: `src/app/login/page.tsx`、`src/app/signup/page.tsx`
- Create: `src/app/auth/callback/route.ts`、`src/app/auth/signout/route.ts`

**Interfaces:**
- Consumes: 环境变量（Task 2）
- Produces:
  - `signInSchema` / `signUpSchema`（zod，字段 `email`、`password`）
  - `createSupabaseBrowserClient()`（`@/lib/supabase/client`）
  - `createSupabaseServerClient()`（`@/lib/supabase/server`）
  - `<AuthForm mode="signin" | "signup" />`

- [ ] **Step 1: 写失败测试**

`src/lib/auth/validation.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { signInSchema, signUpSchema } from './validation';

describe('signInSchema', () => {
  it('接受合法邮箱与密码', () => {
    expect(signInSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true);
  });
  it('拒绝非法邮箱', () => {
    expect(signInSchema.safeParse({ email: 'nope', password: '123456' }).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('密码少于 6 位时报错并给出中文提示', () => {
    const r = signUpSchema.safeParse({ email: 'a@b.com', password: '123' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('密码至少 6 位');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/auth/validation.test.ts
```

Expected: FAIL，提示找不到模块 `./validation`。

- [ ] **Step 3: 写最小实现**

`src/lib/auth/validation.ts`：

```ts
import { z } from 'zod';

export const emailField = z.string().trim().min(1, '请输入邮箱').email('邮箱格式不正确');
export const passwordField = z.string().min(6, '密码至少 6 位');

export const signInSchema = z.object({ email: emailField, password: passwordField });
export const signUpSchema = z.object({ email: emailField, password: passwordField });

export type AuthInput = z.infer<typeof signInSchema>;
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/auth/validation.test.ts
```

Expected: PASS（3 个用例）。

- [ ] **Step 5: 写 Supabase 客户端三件套**

`src/lib/supabase/client.ts`：

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`src/lib/supabase/server.ts`：

```ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component 里不能写 Cookie，交给 middleware 处理
          }
        },
      },
    },
  );
}
```

`src/lib/supabase/middleware.ts`：

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/canvas', '/projects', '/settings'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && (path === '/login' || path === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/canvas';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
```

`src/middleware.ts`：

```ts
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 6: 写认证表单与页面**

`src/components/auth/AuthForm.tsx`（客户端组件）：

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { signInSchema, signUpSchema } from '@/lib/auth/validation';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = mode === 'signin' ? signInSchema : signUpSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const next = params.get('next') ?? '/canvas';

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) { setMessage(error.message); return; }
      router.replace(next);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage(data.session ? '注册成功，正在进入画布…' : '注册成功，请到邮箱点击确认链接');
    if (data.session) router.replace(next);
  }

  async function onMagicLink() {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setMessage(error ? error.message : '魔法链接已发送，请查收邮箱');
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === 'signin' ? '登录' : '注册'}</h1>
      <input aria-label="邮箱" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border px-3 py-2" placeholder="you@example.com" />
      <input aria-label="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded border px-3 py-2" placeholder="至少 6 位" />
      <button type="submit" disabled={busy} className="w-full rounded bg-black px-3 py-2 text-white">
        {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
      </button>
      <button type="button" onClick={onMagicLink} className="w-full rounded border px-3 py-2">
        改用邮箱魔法链接
      </button>
      {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
    </form>
  );
}
```

`src/app/login/page.tsx`、`src/app/signup/page.tsx`：居中容器内渲染 `<Suspense>` 包裹的
`<AuthForm mode="signin" />` / `<AuthForm mode="signup" />`。

`src/app/auth/callback/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/canvas';
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=confirm', url.origin));
}
```

`src/app/auth/signout/route.ts`：POST 处理，`await supabase.auth.signOut()` 后重定向 `/login`。

- [ ] **Step 7: 手动验证登录闭环**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm dev
```

打开 `http://localhost:3000/signup` 注册一个真实邮箱 → 收信点确认链接 → 落到 `/canvas`；
清 Cookie 后访问 `/canvas` 应被重定向到 `/login?next=/canvas`。

Expected: 注册、确认、登录、路由保护四件事都正常。

- [ ] **Step 8: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: email auth with supabase and route protection"
```

---

### Task 4: 画布类型与状态仓库（含撤销/重做）

**Files:**
- Create: `src/lib/canvas/types.ts`
- Create: `src/lib/canvas/alignment.ts`（先写桩，Task 6 替换）
- Create: `src/lib/canvas/store.ts`
- Test: `src/lib/canvas/store.test.ts`

**Interfaces:**
- Consumes: `GRID_SIZE`、`HISTORY_LIMIT`、`DEFAULT_NODE_SIZE`（Task 1）
- Produces: 类型 `CanvasNode`、`TextNodeData`、`ImageNodeData`、`CanvasEdge`、`AiNodeState`、`AiMessage`、`CanvasFile`、`Alignment`；
  `useCanvasStore`（状态 `name/nodes/edges/viewport/past/future`，动作 `commitHistory`、`undo`、`redo`、`canUndo`、`canRedo`、`addTextNode`、`addImageNode`、`updateNodeData`、`removeNodes`、`duplicateNode`、`disconnectNode`、`alignSelection`、`clearCanvas`、`onConnect`、`onNodesChange`、`onEdgesChange`、`setViewport`、`loadCanvas`、`reset`）；
  `selectedNodes()`

- [ ] **Step 1: 写类型文件**

`src/lib/canvas/types.ts`：

```ts
import type { Edge, Node, Viewport, XYPosition } from '@xyflow/react';

export type AiMessage = { id: string; role: 'user' | 'assistant'; text: string; imageSrc?: string; createdAt: string };
export type AiNodeState = { messages: AiMessage[]; status: 'idle' | 'running' | 'error'; error?: string };

export type TextNodeData = { kind: 'text'; text: string; ai: AiNodeState };
export type ImageNodeData = { kind: 'image'; src: string | null; storagePath?: string; alt: string; ai: AiNodeState };
export type CanvasNodeData = TextNodeData | ImageNodeData;

export type CanvasNode = Node<CanvasNodeData & Record<string, unknown>, 'text' | 'image'>;
export type CanvasEdge = Edge<{ relation: 'reference' }, 'reference'>;

export type Alignment = 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY';

export type CanvasFile = {
  version: 1;
  name: string;
  exportedAt: string;
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export type Position = XYPosition;
```

- [ ] **Step 2: 写失败测试**

`src/lib/canvas/store.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';

const s = () => useCanvasStore.getState();

describe('画布状态仓库', () => {
  beforeEach(() => s().reset());

  it('新增文本节点后可以撤销与重做', () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    expect(s().nodes).toHaveLength(1);
    expect(s().nodes[0].id).toBe(id);
    s().undo();
    expect(s().nodes).toHaveLength(0);
    s().redo();
    expect(s().nodes).toHaveLength(1);
  });

  it('删除节点会同时删除相关连线', () => {
    const a = s().addTextNode({ x: 0, y: 0 });
    const b = s().addImageNode({ x: 300, y: 0 });
    s().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    expect(s().edges).toHaveLength(1);
    s().removeNodes([a]);
    expect(s().nodes).toHaveLength(1);
    expect(s().edges).toHaveLength(0);
  });

  it('清空画布可撤销', () => {
    s().addTextNode({ x: 0, y: 0 });
    s().addTextNode({ x: 10, y: 10 });
    s().clearCanvas();
    expect(s().nodes).toHaveLength(0);
    s().undo();
    expect(s().nodes).toHaveLength(2);
  });

  it('可以用 history:false 更新数据而不入栈', () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    const before = s().past.length;
    s().updateNodeData(id, { text: '第一次' } as never);
    s().updateNodeData(id, { text: '第二次' } as never, { history: false });
    expect(s().past.length).toBe(before + 1);
    s().undo();
    const node = s().nodes.find((n) => n.id === id)!;
    expect((node.data as { text?: string }).text).toBe('');
  });

  it('历史栈不超过上限', () => {
    for (let i = 0; i < 130; i += 1) s().addTextNode({ x: i, y: 0 });
    expect(s().past.length).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/store.test.ts
```

Expected: FAIL，找不到模块 `./store`。

- [ ] **Step 4: 写实现**

`src/lib/canvas/alignment.ts` 先写桩：

```ts
import type { Alignment, CanvasNode } from './types';

export function alignNodes(nodes: CanvasNode[], _alignment: Alignment): CanvasNode[] {
  return nodes;
}
```

`src/lib/canvas/store.ts`：

```ts
import { create } from 'zustand';
import {
  applyEdgeChanges, applyNodeChanges,
  type Connection, type EdgeChange, type NodeChange, type Viewport,
} from '@xyflow/react';
import { DEFAULT_NODE_SIZE, HISTORY_LIMIT } from './constants';
import { alignNodes } from './alignment';
import type { Alignment, CanvasEdge, CanvasFile, CanvasNode, CanvasNodeData, ImageNodeData, TextNodeData } from './types';

type Snapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] };
type UpdateOpts = { history?: boolean };
type Store = {
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  past: Snapshot[];
  future: Snapshot[];
  commitHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
  addTextNode: (position?: { x: number; y: number }) => string;
  addImageNode: (position?: { x: number; y: number }) => string;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>, opts?: UpdateOpts) => void;
  removeNodes: (ids: string[]) => void;
  duplicateNode: (id: string) => string | null;
  disconnectNode: (id: string) => void;
  alignSelection: (alignment: Alignment) => void;
  clearCanvas: () => void;
  onConnect: (connection: Connection) => void;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  setViewport: (viewport: Viewport) => void;
  loadCanvas: (file: CanvasFile) => void;
  reset: () => void;
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq += 1)}`;
const emptyAi = () => ({ messages: [], status: 'idle' as const });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const useCanvasStore = create<Store>()((set, get) => {
  const commitHistory = () => {
    const { nodes, edges, past } = get();
    const next = [...past, { nodes: clone(nodes), edges: clone(edges) }];
    set({ past: next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next, future: [] });
  };

  const mutate = (fn: (state: Snapshot) => Partial<Snapshot>, opts: UpdateOpts = {}) => {
    if (opts.history !== false) commitHistory();
    set((state) => fn({ nodes: state.nodes, edges: state.edges }));
  };

  return {
    name: '未命名画布',
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    commitHistory,
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
    undo: () => {
      const { past, future, nodes, edges } = get();
      if (past.length === 0) return;
      set({
        nodes: past[past.length - 1].nodes,
        edges: past[past.length - 1].edges,
        past: past.slice(0, -1),
        future: [{ nodes: clone(nodes), edges: clone(edges) }, ...future].slice(0, HISTORY_LIMIT),
      });
    },
    redo: () => {
      const { past, future, nodes, edges } = get();
      if (future.length === 0) return;
      const [next, ...rest] = future;
      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...past, { nodes: clone(nodes), edges: clone(edges) }].slice(-HISTORY_LIMIT),
        future: rest,
      });
    },
    addTextNode: (position = { x: 0, y: 0 }) => {
      const id = nextId('text');
      const data: TextNodeData = { kind: 'text', text: '', ai: emptyAi() };
      mutate((state) => ({
        nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), {
          id, type: 'text', position,
          width: DEFAULT_NODE_SIZE.text.width, height: DEFAULT_NODE_SIZE.text.height,
          selected: true, data,
        }],
      }));
      return id;
    },
    addImageNode: (position = { x: 0, y: 0 }) => {
      const id = nextId('image');
      const data: ImageNodeData = { kind: 'image', src: null, alt: '图片节点', ai: emptyAi() };
      mutate((state) => ({
        nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), {
          id, type: 'image', position,
          width: DEFAULT_NODE_SIZE.image.width, height: DEFAULT_NODE_SIZE.image.height,
          selected: true, data,
        }],
      }));
      return id;
    },
    updateNodeData: (id, patch, opts) => {
      mutate((state) => ({
        nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } as CanvasNodeData } : n)),
      }), opts);
    },
    removeNodes: (ids) => {
      const target = new Set(ids);
      mutate((state) => ({
        nodes: state.nodes.filter((n) => !target.has(n.id)),
        edges: state.edges.filter((e) => !target.has(e.source) && !target.has(e.target)),
      }));
    },
    duplicateNode: (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return null;
      const newId = nextId(node.type === 'image' ? 'image' : 'text');
      mutate((state) => ({
        nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), {
          ...clone(node), id: newId, selected: true,
          position: { x: node.position.x + 32, y: node.position.y + 32 },
        }],
      }));
      return newId;
    },
    disconnectNode: (id) => mutate((state) => ({
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    })),
    alignSelection: (alignment) => mutate((state) => ({ nodes: alignNodes(state.nodes, alignment) })),
    clearCanvas: () => mutate(() => ({ nodes: [], edges: [] })),
    onConnect: (connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      mutate((state) => ({
        edges: [...state.edges, {
          id: nextId('edge'), source: connection.source!, target: connection.target!,
          type: 'reference', animated: true, data: { relation: 'reference' },
        } as CanvasEdge],
      }));
    },
    onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
    setViewport: (viewport) => set({ viewport }),
    loadCanvas: (file) => set({
      name: file.name, nodes: file.nodes ?? [], edges: file.edges ?? [],
      viewport: file.viewport ?? { x: 0, y: 0, zoom: 1 }, past: [], future: [],
    }),
    reset: () => set({
      name: '未命名画布', nodes: [], edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }, past: [], future: [],
    }),
  };
});

export function selectedNodes(): CanvasNode[] {
  return useCanvasStore.getState().nodes.filter((n) => n.selected);
}
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/store.test.ts
```

Expected: PASS（5 个用例）。

- [ ] **Step 6: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: canvas store with snapshot history"
```

---

### Task 5: 连线参考解析

**Files:**
- Create: `src/lib/canvas/graph.ts`
- Test: `src/lib/canvas/graph.test.ts`

**Interfaces:**
- Consumes: `CanvasNode`、`CanvasEdge`（Task 4）
- Produces:

```ts
export type ReferenceBundle = {
  texts: { nodeId: string; text: string }[];
  images: { nodeId: string; src: string; alt: string }[];
  sources: string[];
};
export function resolveReferences(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): ReferenceBundle;
```

- [ ] **Step 1: 写失败测试**

`src/lib/canvas/graph.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { resolveReferences } from './graph';
import type { CanvasEdge, CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };
const text = (id: string, value: string): CanvasNode => ({
  id, type: 'text', position: { x: 0, y: 0 }, data: { kind: 'text', text: value, ai },
});
const image = (id: string, src: string | null): CanvasNode => ({
  id, type: 'image', position: { x: 0, y: 0 }, data: { kind: 'image', src, alt: id, ai },
});
const edge = (source: string, target: string): CanvasEdge => ({
  id: `${source}->${target}`, source, target, type: 'reference', data: { relation: 'reference' },
});

describe('resolveReferences', () => {
  it('收集入边的文本与图片作为参考', () => {
    const nodes = [text('t1', '水彩风格'), image('i1', 'data:image/png;base64,AAA'), text('n', '')];
    const bundle = resolveReferences('n', nodes, [edge('t1', 'n'), edge('i1', 'n')]);
    expect(bundle.texts.map((t) => t.text)).toEqual(['水彩风格']);
    expect(bundle.images.map((i) => i.src)).toEqual(['data:image/png;base64,AAA']);
    expect(bundle.sources).toEqual(['t1', 'i1']);
  });

  it('忽略出边方向（source 不算参考）', () => {
    const nodes = [text('t1', 'A'), image('i1', null)];
    const bundle = resolveReferences('t1', nodes, [edge('t1', 'i1')]);
    expect(bundle.texts).toHaveLength(0);
    expect(bundle.images).toHaveLength(0);
  });

  it('空文本与未上传图片不计入参考', () => {
    const nodes = [text('t1', '   '), image('i1', null)];
    const bundle = resolveReferences('n', nodes, [edge('t1', 'n'), edge('i1', 'n')]);
    expect(bundle.texts).toHaveLength(0);
    expect(bundle.images).toHaveLength(0);
  });

  it('同一来源重复连线只算一次', () => {
    const nodes = [text('t1', 'A')];
    const bundle = resolveReferences('n', nodes, [edge('t1', 'n'), { ...edge('t1', 'n'), id: 'dup' }]);
    expect(bundle.texts).toHaveLength(1);
  });

  it('入边指向不存在的节点时安全跳过', () => {
    expect(resolveReferences('n', [], [edge('ghost', 'n')]).sources).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/graph.test.ts
```

Expected: FAIL，找不到模块 `./graph`。

- [ ] **Step 3: 写实现**

`src/lib/canvas/graph.ts`：

```ts
import type { CanvasEdge, CanvasNode } from './types';

export type ReferenceBundle = {
  texts: { nodeId: string; text: string }[];
  images: { nodeId: string; src: string; alt: string }[];
  sources: string[];
};

export function resolveReferences(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): ReferenceBundle {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const bundle: ReferenceBundle = { texts: [], images: [], sources: [] };

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    if (seen.has(edge.source)) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    seen.add(edge.source);

    if (source.data.kind === 'text') {
      const value = source.data.text.trim();
      if (!value) continue;
      bundle.texts.push({ nodeId: source.id, text: value });
    } else {
      const src = source.data.src;
      if (!src) continue;
      bundle.images.push({ nodeId: source.id, src, alt: source.data.alt });
    }
    bundle.sources.push(source.id);
  }
  return bundle;
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test
cd "D:\react flow"; git add -A; git commit -m "feat: resolve node references from inbound edges"
```

Expected: 全部测试 PASS。

---

### Task 6: 对齐计算

**Files:**
- Modify: `src/lib/canvas/alignment.ts`（替换 Task 4 的桩）
- Test: `src/lib/canvas/alignment.test.ts`

**Interfaces:**
- Consumes: `CanvasNode`、`Alignment`、`DEFAULT_NODE_SIZE`
- Produces: `alignNodes(nodes: CanvasNode[], alignment: Alignment): CanvasNode[]`
  —— 只移动 `selected === true` 的节点，基准是选中节点的包围盒；未选中节点原样返回。

- [ ] **Step 1: 写失败测试**

`src/lib/canvas/alignment.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { alignNodes } from './alignment';
import type { CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };
const node = (id: string, x: number, y: number, w: number, h: number, selected = true): CanvasNode => ({
  id, type: 'text', position: { x, y }, width: w, height: h, selected,
  data: { kind: 'text', text: '', ai },
});
const pos = (nodes: CanvasNode[]) => Object.fromEntries(nodes.map((n) => [n.id, n.position]));

describe('alignNodes', () => {
  it('左对齐到选区最左边界', () => {
    const nodes = [node('a', 100, 0, 200, 100), node('b', 400, 200, 100, 50)];
    expect(pos(alignNodes(nodes, 'left'))).toEqual({ a: { x: 100, y: 0 }, b: { x: 100, y: 200 } });
  });

  it('右对齐到选区最右边界', () => {
    const nodes = [node('a', 100, 0, 200, 100), node('b', 400, 200, 100, 50)];
    expect(pos(alignNodes(nodes, 'right'))).toEqual({ a: { x: 300, y: 0 }, b: { x: 400, y: 200 } });
  });

  it('水平居中到选区中心', () => {
    const nodes = [node('a', 0, 0, 100, 100), node('b', 300, 0, 100, 100)];
    expect(pos(alignNodes(nodes, 'centerX'))).toEqual({ a: { x: 150, y: 0 }, b: { x: 150, y: 0 } });
  });

  it('顶对齐与底对齐', () => {
    const nodes = [node('a', 0, 10, 100, 100), node('b', 0, 200, 100, 50)];
    expect(pos(alignNodes(nodes, 'top'))).toEqual({ a: { x: 0, y: 10 }, b: { x: 0, y: 10 } });
    expect(pos(alignNodes(nodes, 'bottom'))).toEqual({ a: { x: 0, y: 150 }, b: { x: 0, y: 200 } });
  });

  it('垂直居中到选区中心', () => {
    const nodes = [node('a', 0, 0, 100, 100), node('b', 0, 300, 100, 100)];
    expect(pos(alignNodes(nodes, 'centerY'))).toEqual({ a: { x: 0, y: 150 }, b: { x: 0, y: 150 } });
  });

  it('未选中节点不受影响', () => {
    const nodes = [node('a', 100, 0, 200, 100), node('b', 400, 200, 100, 50, false)];
    expect(pos(alignNodes(nodes, 'left')).b).toEqual({ x: 400, y: 200 });
  });

  it('选中数量少于 2 时原样返回', () => {
    const nodes = [node('a', 100, 0, 200, 100)];
    expect(pos(alignNodes(nodes, 'left'))).toEqual({ a: { x: 100, y: 0 } });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/alignment.test.ts
```

Expected: FAIL（桩实现不改位置）。

- [ ] **Step 3: 写实现**

`src/lib/canvas/alignment.ts`：

```ts
import { DEFAULT_NODE_SIZE } from './constants';
import type { Alignment, CanvasNode } from './types';

function sizeOf(node: CanvasNode) {
  const fallback = DEFAULT_NODE_SIZE[node.type === 'image' ? 'image' : 'text'];
  return {
    width: node.width ?? node.measured?.width ?? fallback.width,
    height: node.height ?? node.measured?.height ?? fallback.height,
  };
}

export function alignNodes(nodes: CanvasNode[], alignment: Alignment): CanvasNode[] {
  const boxes = nodes
    .filter((n) => n.selected)
    .map((node) => ({ node, ...sizeOf(node) }));
  if (boxes.length < 2) return nodes;

  const minX = Math.min(...boxes.map((b) => b.node.position.x));
  const minY = Math.min(...boxes.map((b) => b.node.position.y));
  const maxRight = Math.max(...boxes.map((b) => b.node.position.x + b.width));
  const maxBottom = Math.max(...boxes.map((b) => b.node.position.y + b.height));
  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;

  const moved = new Map<string, { x: number; y: number }>();
  for (const box of boxes) {
    const { x, y } = box.node.position;
    if (alignment === 'left') moved.set(box.node.id, { x: minX, y });
    else if (alignment === 'right') moved.set(box.node.id, { x: maxRight - box.width, y });
    else if (alignment === 'centerX') moved.set(box.node.id, { x: centerX - box.width / 2, y });
    else if (alignment === 'top') moved.set(box.node.id, { x, y: minY });
    else if (alignment === 'bottom') moved.set(box.node.id, { x, y: maxBottom - box.height });
    else moved.set(box.node.id, { x, y: centerY - box.height / 2 });
  }
  return nodes.map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n));
}
```

- [ ] **Step 4: 运行全部测试并提交**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test
cd "D:\react flow"; git add -A; git commit -m "feat: node alignment math"
```

Expected: `store`、`graph`、`alignment` 三个测试文件全 PASS。

---

### Task 7: 画布序列化与导出 JSON

**Files:**
- Create: `src/lib/canvas/serialization.ts`
- Test: `src/lib/canvas/serialization.test.ts`

**Interfaces:**
- Consumes: `CanvasFile`、`CanvasNode`、`CanvasEdge`
- Produces:

```ts
export const canvasFileSchema: z.ZodType<CanvasFile>;
export function buildCanvasFile(input: {
  name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: Viewport; now?: Date;
}): CanvasFile;
export function serializeCanvasFile(file: CanvasFile): string;
export function parseCanvasFile(text: string): CanvasFile;
export function canvasFileName(name: string, now?: Date): string;
export function downloadJson(filename: string, json: string): void;
```

- [ ] **Step 1: 写失败测试**

`src/lib/canvas/serialization.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildCanvasFile, canvasFileName, parseCanvasFile, serializeCanvasFile } from './serialization';
import type { CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };
const nodes: CanvasNode[] = [{
  id: 'n1', type: 'text', position: { x: 1, y: 2 }, width: 240, height: 120,
  data: { kind: 'text', text: '你好', ai },
}];
const viewport = { x: 0, y: 0, zoom: 1 };

describe('画布序列化', () => {
  it('构建的文件包含版本、时间与视口', () => {
    const file = buildCanvasFile({ name: '示例', nodes, edges: [], viewport, now: new Date('2026-09-20T07:30:00Z') });
    expect(file.version).toBe(1);
    expect(file.exportedAt).toBe('2026-09-20T07:30:00.000Z');
    expect(file.nodes).toHaveLength(1);
  });

  it('序列化后能原样解析回来', () => {
    const file = buildCanvasFile({ name: '示例', nodes, edges: [], viewport });
    const roundTrip = parseCanvasFile(serializeCanvasFile(file));
    expect(roundTrip.nodes[0].data).toEqual(file.nodes[0].data);
    expect(serializeCanvasFile(roundTrip)).toBe(serializeCanvasFile(file));
  });

  it('非法 JSON 抛出中文错误', () => {
    expect(() => parseCanvasFile('{not json')).toThrow('画布 JSON 格式不正确');
    expect(() => parseCanvasFile(JSON.stringify({ version: 2 }))).toThrow('画布 JSON 格式不正确');
  });

  it('文件名去掉不安全字符并带时间戳', () => {
    expect(canvasFileName('我的/画布: v1', new Date('2026-09-20T07:30:00Z'))).toBe('canvas-我的-画布- v1-20260920-0730.json');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/serialization.test.ts
```

Expected: FAIL，找不到模块。

- [ ] **Step 3: 写实现**

`src/lib/canvas/serialization.ts`：

```ts
import { z } from 'zod';
import type { Viewport } from '@xyflow/react';
import type { CanvasEdge, CanvasFile, CanvasNode } from './types';

const positionSchema = z.object({ x: z.number(), y: z.number() });
const aiMessageSchema = z.object({
  id: z.string(), role: z.enum(['user', 'assistant']), text: z.string(),
  imageSrc: z.string().optional(), createdAt: z.string(),
});
const aiStateSchema = z.object({
  messages: z.array(aiMessageSchema),
  status: z.enum(['idle', 'running', 'error']),
  error: z.string().optional(),
});
const dataSchema = z.union([
  z.object({ kind: z.literal('text'), text: z.string(), ai: aiStateSchema }),
  z.object({
    kind: z.literal('image'), src: z.string().nullable(),
    storagePath: z.string().optional(), alt: z.string(), ai: aiStateSchema,
  }),
]);
const nodeSchema = z.object({
  id: z.string(), type: z.enum(['text', 'image']), position: positionSchema,
  width: z.number().optional(), height: z.number().optional(),
  selected: z.boolean().optional(), data: dataSchema,
}).passthrough();
const edgeSchema = z.object({
  id: z.string(), source: z.string(), target: z.string(),
  type: z.literal('reference').optional(), animated: z.boolean().optional(),
  data: z.object({ relation: z.literal('reference') }).optional(),
}).passthrough();

export const canvasFileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  exportedAt: z.string(),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
}) as unknown as z.ZodType<CanvasFile>;

export function buildCanvasFile(input: {
  name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: Viewport; now?: Date;
}): CanvasFile {
  return {
    version: 1,
    name: input.name || '未命名画布',
    exportedAt: (input.now ?? new Date()).toISOString(),
    viewport: input.viewport,
    nodes: input.nodes,
    edges: input.edges,
  };
}

export function serializeCanvasFile(file: CanvasFile): string {
  return JSON.stringify(file, null, 2);
}

export function parseCanvasFile(text: string): CanvasFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('画布 JSON 格式不正确');
  }
  const parsed = canvasFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error('画布 JSON 格式不正确');
  return parsed.data;
}

export function canvasFileName(name: string, now: Date = new Date()): string {
  const safe = (name || '未命名画布').replace(/[\\/:*?"<>|]/g, '-').trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `canvas-${safe}-${stamp}.json`;
}

export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

代码注释里标注限制：私有桶图片的 `src` 是签名 URL（会过期），导出时同时保留
`storagePath`；Phase 2 支持把图片内联成 base64 导出。

- [ ] **Step 4: 运行测试确认通过并提交**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test
cd "D:\react flow"; git add -A; git commit -m "feat: canvas json serialization and export"
```

Expected: 4 个新用例 PASS。

---

### Task 8: 画布外壳、网格吸附与左侧工具栏

**Files:**
- Create: `src/components/canvas/CanvasToolbar.tsx`
- Create: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `src/app/canvas/page.tsx`
- Modify: `src/app/globals.css`（引入 React Flow 样式）

**Interfaces:**
- Consumes: `useCanvasStore`（Task 4）
- Produces:
  - `type CanvasTool = 'select' | 'hand'`
  - `<CanvasToolbar tool onToolChange />`：左侧竖排按钮，最底部是「清空画布」（二次确认）
  - `<CanvasWorkspace />`：`ReactFlowProvider` + `ReactFlow` + `Background` + `Controls` + `MiniMap`
  - 拖拽开始调用 `commitHistory()`，拖拽结束才形成一次历史点

- [ ] **Step 1: 写工具栏**

`src/components/canvas/CanvasToolbar.tsx`：

```tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useCanvasStore } from '@/lib/canvas/store';

export type CanvasTool = 'select' | 'hand';

function ToolButton({ label, onClick, active, disabled, danger }: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-md border text-[11px] transition',
        active ? 'bg-black text-white' : 'bg-white hover:bg-gray-100',
        danger ? 'text-red-600' : '',
        disabled ? 'cursor-not-allowed opacity-40' : '',
      ].join(' ')}
    >
      {label.slice(0, 2)}
    </button>
  );
}

function Divider(): ReactNode {
  return <span className="my-1 h-px w-8 bg-gray-200" />;
}

export function CanvasToolbar({ tool, onToolChange }: { tool: CanvasTool; onToolChange: (t: CanvasTool) => void }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);
  const store = useCanvasStore.getState();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editing = !!target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable);
      if (editing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'v' || e.key === 'V') onToolChange('select');
      if (e.key === 'h' || e.key === 'H') onToolChange('hand');
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) { e.preventDefault(); store.redo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        store.removeNodes(selectedIds);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToolChange, store, selectedIds]);

  return (
    <aside className="absolute left-3 top-3 z-20 flex h-[calc(100%-24px)] w-14 flex-col items-center gap-2 rounded-xl border bg-white/95 p-2 shadow">
      <ToolButton label="选择工具 V" active={tool === 'select'} onClick={() => onToolChange('select')} />
      <ToolButton label="抓手工具 H" active={tool === 'hand'} onClick={() => onToolChange('hand')} />
      <Divider />
      <ToolButton label="添加文本节点" onClick={() => store.addTextNode({ x: 120, y: 120 })} />
      <ToolButton label="添加图片节点" onClick={() => store.addImageNode({ x: 120, y: 120 })} />
      <Divider />
      <ToolButton label="撤销" disabled={!canUndo} onClick={() => store.undo()} />
      <ToolButton label="重做" disabled={!canRedo} onClick={() => store.redo()} />
      <ToolButton label="删除选中" disabled={selectedIds.length === 0} onClick={() => store.removeNodes(selectedIds)} />
      <div className="mt-auto flex flex-col items-center gap-1">
        {confirmingClear && <span className="text-[10px] leading-tight text-red-600">再点一次确认</span>}
        <ToolButton
          label="清空画布" danger
          onClick={() => {
            if (confirmingClear) { store.clearCanvas(); setConfirmingClear(false); }
            else setConfirmingClear(true);
          }}
        />
      </div>
    </aside>
  );
}
```

说明：按钮的 `aria-label` 就是自动化测试与无障碍依赖的名字，后续 Playwright 用例按
「添加文本节点」「撤销」「重做」「清空画布」这些名字定位；按钮显示文字是标签前两个字。

- [ ] **Step 2: 写画布外壳**

`src/components/canvas/CanvasWorkspace.tsx`：

```tsx
'use client';
import { useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode,
} from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { GRID_SIZE } from '@/lib/canvas/constants';
import { CanvasToolbar, type CanvasTool } from './CanvasToolbar';
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';

const nodeTypes = { text: TextNode, image: ImageNode };

function Inner() {
  const [tool, setTool] = useState<CanvasTool>('select');
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const store = useCanvasStore.getState();

  return (
    <div className="relative h-dvh w-full">
      <CanvasToolbar tool={tool} onToolChange={setTool} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={store.onNodesChange}
        onEdgesChange={store.onEdgesChange}
        onConnect={store.onConnect}
        onNodeDragStart={() => store.commitHistory()}
        onMoveEnd={(_, viewport) => store.setViewport(viewport)}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        panOnDrag={tool === 'hand' ? true : [1, 2]}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={tool === 'select'}
        fitView
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export function CanvasWorkspace() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
```

要点：`deleteKeyCode={null}` 关掉 React Flow 自带删除，删除统一由 store 处理；
`panOnDrag` 在抓手工具下左键平移，选择工具下用中键/右键平移。

- [ ] **Step 3: 接入页面与样式**

`src/app/canvas/page.tsx` 渲染 `<CanvasWorkspace />`；
`src/app/globals.css` 顶部加 `@import '@xyflow/react/dist/style.css';`。

- [ ] **Step 4: 手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm dev
```

登录后打开 `/canvas`：出现点阵网格；点「添加文本节点」出现节点；`Ctrl+Z` 撤销、
`Ctrl+Shift+Z` 重做；按 `V`/`H` 切换后拖拽行为不同（选择工具框选，抓手工具平移画布）；
最底部「清空画布」需点两次才清空。

- [ ] **Step 5: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: canvas workspace with grid, tools and toolbar"
```

---

### Task 9: 文本节点（双击编辑 + 拖拽缩放）

**Files:**
- Create: `src/components/canvas/nodes/TextNode.tsx`
- Test: `src/components/canvas/nodes/TextNode.test.tsx`

**Interfaces:**
- Consumes: `useCanvasStore`、`CanvasNode`、`MIN_NODE_SIZE.text`
- Produces: `<TextNode />`（React Flow 自定义节点，`type = 'text'`）：双击进入编辑，
  `Esc` 取消、失焦提交，右下角手柄缩放，顶部 target 连接点、底部 source 连接点

- [ ] **Step 1: 写失败测试**

`src/components/canvas/nodes/TextNode.test.tsx`：

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { TextNode } from './TextNode';
import { useCanvasStore } from '@/lib/canvas/store';

const s = () => useCanvasStore.getState();

function setup() {
  const id = s().addTextNode({ x: 0, y: 0 });
  const node = s().nodes.find((n) => n.id === id)!;
  render(
    <ReactFlowProvider>
      <TextNode {...({ id, data: node.data, selected: false, type: 'text', position: node.position,
        width: 240, height: 120, dragging: false, zIndex: 0, isConnectable: true } as never)} />
    </ReactFlowProvider>,
  );
  return id;
}

describe('TextNode', () => {
  beforeEach(() => s().reset());

  it('双击后显示可编辑输入框', async () => {
    setup();
    await userEvent.dblClick(screen.getByTestId('text-node-body'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('输入内容并失焦后写回 store 且可撤销', async () => {
    const id = setup();
    await userEvent.dblClick(screen.getByTestId('text-node-body'));
    await userEvent.type(screen.getByRole('textbox'), '水彩风格');
    await userEvent.tab();
    expect((s().nodes.find((n) => n.id === id)!.data as { text: string }).text).toBe('水彩风格');
    s().undo();
    expect((s().nodes.find((n) => n.id === id)!.data as { text: string }).text).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/components/canvas/nodes/TextNode.test.tsx
```

Expected: FAIL，找不到模块。

- [ ] **Step 3: 写实现**

`src/components/canvas/nodes/TextNode.tsx`：

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { MIN_NODE_SIZE } from '@/lib/canvas/constants';
import type { CanvasNode } from '@/lib/canvas/types';

export function TextNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const text = data.kind === 'text' ? data.text : '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const commitHistory = useCanvasStore((s) => s.commitHistory);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== text) updateNodeData(id, { text: draft });
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_SIZE.text.width}
        minHeight={MIN_NODE_SIZE.text.height}
        onResizeStart={() => commitHistory()}
      />
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        data-testid="text-node-body"
        onDoubleClick={() => { setDraft(text); setEditing(true); }}
        className="h-full w-full rounded-lg border bg-white p-2 text-sm shadow-sm"
      >
        {editing ? (
          <textarea
            ref={ref} value={draft} aria-label="文本节点内容"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(text); setEditing(false); } }}
            className="h-full w-full resize-none border-none outline-none"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        )}
      </div>
    </>
  );
}
```

要点：`onPointerDown` 阻止冒泡，避免在输入框里选中文字时拖动整个节点；
编辑期间不记历史，提交时才通过 `updateNodeData` 入栈。

- [ ] **Step 4: 运行测试并手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test; pnpm dev
```

Expected: 组件测试 PASS；浏览器中双击文本节点可输入，拖右下角可改尺寸，`Ctrl+Z` 能撤销输入。

- [ ] **Step 5: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: editable text node with resizer"
```

---

### Task 10: 图片节点（点击上传 + 拖拽文件 + 缩放）

**Files:**
- Create: `src/lib/canvas/upload.ts`
- Test: `src/lib/canvas/upload.test.ts`
- Create: `src/components/canvas/UploadImageButton.tsx`
- Create: `src/components/canvas/nodes/ImageNode.tsx`

**Interfaces:**
- Consumes: `createSupabaseBrowserClient`（Task 3）、`useCanvasStore`、`MIN_NODE_SIZE.image`
- Produces:

```ts
export const CANVAS_IMAGE_BUCKET = 'canvas-images';
export const SIGNED_URL_TTL_SECONDS = 3600;
export function canvasImagePath(userId: string, fileName: string, now?: Date): string;
export async function uploadCanvasImage(file: File, userId: string): Promise<{ path: string; src: string }>;
```

  以及 `<UploadImageButton busy error onPick />` 与 `<ImageNode />`。

- [ ] **Step 1: 写失败测试**

`src/lib/canvas/upload.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { canvasImagePath } from './upload';

describe('canvasImagePath', () => {
  it('把用户 id 作为目录前缀', () => {
    expect(canvasImagePath('user-1', 'photo.PNG', new Date(1000))).toBe('user-1/1000-photo.PNG');
  });
  it('文件名里的路径分隔符与空格换成下划线', () => {
    expect(canvasImagePath('u', 'a/b\\c d.png', new Date(1))).toBe('u/1-a_b_c_d.png');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/upload.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 写上传实现**

`src/lib/canvas/upload.ts`：

```ts
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const CANVAS_IMAGE_BUCKET = 'canvas-images';
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function canvasImagePath(userId: string, fileName: string, now: Date = new Date()): string {
  return `${userId}/${now.getTime()}-${fileName.replace(/[\\/\s]+/g, '_')}`;
}

export async function uploadCanvasImage(file: File, userId: string) {
  const supabase = createSupabaseBrowserClient();
  const path = canvasImagePath(userId, file.name);
  const { error } = await supabase.storage.from(CANVAS_IMAGE_BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(`图片上传失败：${error.message}`);

  const { data, error: signError } = await supabase.storage
    .from(CANVAS_IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) throw new Error(`生成图片地址失败：${signError?.message ?? '未知错误'}`);
  return { path, src: data.signedUrl };
}
```

- [ ] **Step 4: 写上传按钮与图片节点**

`src/components/canvas/UploadImageButton.tsx`：

```tsx
'use client';

export function UploadImageButton({ busy, error, onPick }: {
  busy: boolean; error: string | null; onPick: (file: File) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-2">
      <label className="cursor-pointer rounded border px-3 py-1 text-xs hover:bg-gray-50">
        {busy ? '上传中…' : '点击上传图片'}
        <input
          type="file" accept="image/*" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onPick(file); }}
        />
      </label>
      {error && <p role="alert" className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
```

`src/components/canvas/nodes/ImageNode.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { uploadCanvasImage } from '@/lib/canvas/upload';
import { MIN_NODE_SIZE } from '@/lib/canvas/constants';
import { UploadImageButton } from '../UploadImageButton';
import type { CanvasNode } from '@/lib/canvas/types';

export function ImageNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const src = data.kind === 'image' ? data.src : null;
  const alt = data.kind === 'image' ? data.alt : '图片';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const commitHistory = useCanvasStore((s) => s.commitHistory);

  async function handleFile(file: File) {
    setBusy(true); setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('请先登录再上传图片');
      const { path, src: url } = await uploadCanvasImage(file, auth.user.id);
      updateNodeData(id, { src: url, storagePath: path });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_SIZE.image.width}
        minHeight={MIN_NODE_SIZE.image.height}
        onResizeStart={() => commitHistory()}
      />
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        data-testid="image-node-body"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) void handleFile(file); }}
        className="h-full w-full overflow-hidden rounded-lg border bg-white shadow-sm"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <UploadImageButton busy={busy} error={error} onPick={handleFile} />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: 运行测试并手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test; pnpm dev
```

Expected: `upload.test.ts` PASS；浏览器中点图片节点能选本地图片上传并显示；
把图片文件拖到节点上也能上传；缩放节点时图片自适应；`Ctrl+Z` 回到未上传状态。

- [ ] **Step 6: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: image node with upload and drop"
```

---

### Task 11: 参考边样式与右键菜单（画布 / 节点）

**Files:**
- Create: `src/components/canvas/edgeTypes.ts`
- Create: `src/components/canvas/CanvasContextMenu.tsx`
- Create: `src/components/canvas/NodeContextMenu.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`

**Interfaces:**
- Consumes: `useCanvasStore`、`buildCanvasFile` / `serializeCanvasFile` / `downloadJson` / `canvasFileName`（Task 7）
- Produces:
  - 空白右键菜单项：添加文本节点 / 添加图片节点 / 全选 / 导出画布 JSON
  - 节点右键菜单项：删除节点 / 用此图生成 / 断开全部连线 / 复制节点
  - 事件契约：`onRequestAiPanel(nodeId: string)`（Task 15 消费）

- [ ] **Step 1: 写参考边样式**

`src/components/canvas/edgeTypes.ts`：

```tsx
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export function ReferenceEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <BaseEdge
      path={path}
      style={{ stroke: selected ? '#4338ca' : '#94a3b8', strokeWidth: 1.5, strokeDasharray: '6 4' }}
    />
  );
}

export const edgeTypes = { reference: ReferenceEdge };
```

- [ ] **Step 2: 写画布右键菜单**

`src/components/canvas/CanvasContextMenu.tsx`：

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { buildCanvasFile, canvasFileName, downloadJson, serializeCanvasFile } from '@/lib/canvas/serialization';

type MenuState = { x: number; y: number; flow: { x: number; y: number } } | null;

export function CanvasContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const name = useCanvasStore((s) => s.name);
  const viewport = useCanvasStore((s) => s.viewport);
  const store = useCanvasStore.getState();

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  function exportJson() {
    const file = buildCanvasFile({ name, nodes, edges, viewport });
    downloadJson(canvasFileName(name), serializeCanvasFile(file));
  }

  const items = menu ? [
    { label: '添加文本节点', run: () => store.addTextNode(menu.flow) },
    { label: '添加图片节点', run: () => store.addImageNode(menu.flow) },
    { label: '全选', run: () => store.onNodesChange(nodes.map((n) => ({ id: n.id, type: 'select', selected: true }))) },
    { label: '导出画布 JSON', run: exportJson },
  ] : [];

  return (
    <div
      className="absolute inset-0 z-10"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({
          x: event.clientX, y: event.clientY,
          flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        });
      }}
    >
      {menu && (
        <ul
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-50 w-40 rounded-md border bg-white py-1 text-sm shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-gray-100"
                onClick={() => { item.run(); setMenu(null); }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

注意：这个覆盖层是绝对定位的透明层，需要放在 React Flow 之上、工具栏之下（`z-10`），
并且 `pointer-events` 保持默认，否则会挡住节点操作 —— 实现时把它作为 React Flow 的
兄弟节点渲染，只在 `onContextMenu` 时拦截事件。

- [ ] **Step 3: 写节点右键菜单**

`src/components/canvas/NodeContextMenu.tsx`：

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useCanvasStore } from '@/lib/canvas/store';

export function NodeContextMenu({ onRequestAiPanel }: { onRequestAiPanel: (nodeId: string) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const nodes = useCanvasStore((s) => s.nodes);
  const store = useCanvasStore.getState();
  const node = menu ? nodes.find((n) => n.id === menu.nodeId) : undefined;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const items = menu ? [
    { label: '删除节点', run: () => store.removeNodes([menu.nodeId]) },
    { label: '用此图生成', disabled: node?.type !== 'image', run: () => onRequestAiPanel(menu.nodeId) },
    { label: '断开全部连线', run: () => store.disconnectNode(menu.nodeId) },
    { label: '复制节点', run: () => store.duplicateNode(menu.nodeId) },
  ] : [];

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      onContextMenu={undefined}
    >
      {menu && (
        <ul
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          className="pointer-events-auto fixed z-50 w-40 rounded-md border bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button" disabled={item.disabled}
                className="w-full px-3 py-1.5 text-left hover:bg-gray-100 disabled:opacity-40"
                onClick={() => { item.run(); setMenu(null); }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <NodeContextTrigger onOpen={setMenu} />
    </div>
  );
}
```

`NodeContextTrigger` 用 React Flow 的 `useReactFlow().getNodes()` 在 `onNodeContextMenu` 时
定位：实际挂载方式是在 `CanvasWorkspace` 的 `<ReactFlow onNodeContextMenu={...} />` 上，
把 `{ x: event.clientX, y: event.clientY, nodeId: node.id }` 通过状态传进本组件
（实现时把 `menu` 状态提升到 `CanvasWorkspace`，本组件改为受控 props：
`menu`、`onClose`、`onRequestAiPanel`）。这一步的目标是：右键节点弹菜单、点空白关闭。

- [ ] **Step 4: 挂到画布**

`CanvasWorkspace` 增加：

```tsx
const [aiPanelNodeId, setAiPanelNodeId] = useState<string | null>(null);
const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

<ReactFlow
  edgeTypes={edgeTypes}
  onNodeContextMenu={(event, node) => {
    event.preventDefault();
    setNodeMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }}
  ...
/>
<CanvasContextMenu />
<NodeContextMenu menu={nodeMenu} onClose={() => setNodeMenu(null)} onRequestAiPanel={setAiPanelNodeId} />
{aiPanelNodeId && <NodeAiPanel nodeId={aiPanelNodeId} onClose={() => setAiPanelNodeId(null)} />}
```

（`NodeAiPanel` 由 Task 15 提供；本任务先写上占位渲染，Task 15 补真实组件。）

- [ ] **Step 5: 手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm dev
```

空白处右键出现菜单并能加节点；节点上右键出现菜单，「复制节点」出现副本；
「删除节点」生效且 `Ctrl+Z` 可恢复；拖连接点画出虚线参考边；
「导出画布 JSON」下载 `canvas-未命名画布-*.json`，里面有 `nodes` 与 `edges`。

- [ ] **Step 6: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: context menus and reference edges"
```

---

### Task 12: 对齐条

**Files:**
- Create: `src/components/canvas/AlignmentBar.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`

**Interfaces:**
- Consumes: `useCanvasStore.alignSelection`（Task 4 / 6）
- Produces: `<AlignmentBar />`，选中节点 ≥ 2 时显示，6 个按钮：
  左对齐 / 右对齐 / 水平居中 / 顶对齐 / 底对齐 / 垂直居中

- [ ] **Step 1: 写组件**

`src/components/canvas/AlignmentBar.tsx`：

```tsx
'use client';
import { useCanvasStore } from '@/lib/canvas/store';
import type { Alignment } from '@/lib/canvas/types';

const ITEMS: { key: Alignment; label: string }[] = [
  { key: 'left', label: '左对齐' },
  { key: 'right', label: '右对齐' },
  { key: 'centerX', label: '水平居中' },
  { key: 'top', label: '顶对齐' },
  { key: 'bottom', label: '底对齐' },
  { key: 'centerY', label: '垂直居中' },
];

export function AlignmentBar() {
  const selectedCount = useCanvasStore((s) => s.nodes.filter((n) => n.selected).length);
  const alignSelection = useCanvasStore((s) => s.alignSelection);
  if (selectedCount < 2) return null;

  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-1 rounded-lg border bg-white/95 px-2 py-1 shadow">
      {ITEMS.map((item) => (
        <button
          key={item.key} type="button" title={item.label} aria-label={item.label}
          onClick={() => alignSelection(item.key)}
          className="rounded px-2 py-1 text-xs hover:bg-gray-100"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 挂到画布**

`CanvasWorkspace` 的 `<CanvasToolbar />` 之后加 `<AlignmentBar />`。

- [ ] **Step 3: 手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm dev
```

放 3 个节点 → Shift 点选 2 个以上 → 顶部出现对齐条 → 点「左对齐」左边缘对齐 →
`Ctrl+Z` 回到原位；只选 1 个节点时对齐条消失。

- [ ] **Step 4: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: alignment bar for multi-selected nodes"
```

---

### Task 13: 自定义 API 设置（settings 页）

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/settings.ts`
- Test: `src/lib/ai/settings.test.ts`
- Create: `src/components/ai/AiSettingsForm.tsx`
- Create: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `localStorage`
- Produces:

```ts
export type AiProvider = 'openai-compatible' | 'mock';
export type AiConfig = {
  provider: AiProvider; baseUrl: string; apiKey: string;
  imageModel: string; textModel: string; imageSize: string;
};
export type AiImageReference = { name: string; dataUrl: string };
export type AiGenerateRequest = {
  mode: 'image' | 'text'; nodeId: string; prompt: string;
  references: { texts: string[]; images: AiImageReference[] };
  size?: string; config: AiConfig;
};
export type AiGenerateResponse = { imageSrc?: string; text?: string; error?: string };

export const AI_SETTINGS_KEY = 'ai-canvas:settings';
export const DEFAULT_AI_SETTINGS: AiConfig;
export function loadAiSettings(): AiConfig;
export function saveAiSettings(config: AiConfig): void;
export function isAiConfigured(config: AiConfig): boolean;
```

- [ ] **Step 1: 写类型与失败测试**

`src/lib/ai/types.ts` 按上面 Interfaces 段落写全（含 6 个字段的类型）。

`src/lib/ai/settings.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS, isAiConfigured, loadAiSettings, saveAiSettings } from './settings';

describe('AI 设置读写', () => {
  beforeEach(() => localStorage.clear());

  it('没有配置时返回默认值', () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('保存后能读回', () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, provider: 'openai-compatible', baseUrl: 'https://x.dev/v1', apiKey: 'k', imageModel: 'img' });
    const loaded = loadAiSettings();
    expect(loaded.baseUrl).toBe('https://x.dev/v1');
    expect(loaded.imageModel).toBe('img');
  });

  it('损坏的 JSON 回落到默认值', () => {
    localStorage.setItem(AI_SETTINGS_KEY, '{oops');
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('判断配置是否可用', () => {
    expect(isAiConfigured(DEFAULT_AI_SETTINGS)).toBe(true);
    expect(isAiConfigured({ ...DEFAULT_AI_SETTINGS, provider: 'openai-compatible', apiKey: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/ai/settings.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/lib/ai/settings.ts`：

```ts
import { z } from 'zod';
import type { AiConfig } from './types';

export const AI_SETTINGS_KEY = 'ai-canvas:settings';

export const DEFAULT_AI_SETTINGS: AiConfig = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  imageModel: 'gpt-image-1',
  textModel: 'gpt-4o-mini',
  imageSize: '1024x1024',
};

const schema = z.object({
  provider: z.enum(['openai-compatible', 'mock']),
  baseUrl: z.string(),
  apiKey: z.string(),
  imageModel: z.string(),
  textModel: z.string(),
  imageSize: z.string(),
});

export function loadAiSettings(): AiConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_AI_SETTINGS;
  const raw = localStorage.getItem(AI_SETTINGS_KEY);
  if (!raw) return DEFAULT_AI_SETTINGS;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_AI_SETTINGS;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(config: AiConfig): void {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(config));
}

export function isAiConfigured(config: AiConfig): boolean {
  if (config.provider === 'mock') return true;
  return config.baseUrl.trim() !== '' && config.apiKey.trim() !== '' && config.imageModel.trim() !== '';
}
```

- [ ] **Step 4: 写设置表单与页面**

`AiSettingsForm.tsx` 要点：字段名与 `AiConfig` 一一对应，字段标签用中文
（供应商 / Base URL / API Key / 图片模型 / 文本模型 / 默认图片尺寸）；
保存按钮写 localStorage 并显示「已保存到本机浏览器」；「测试连接」按钮发
`POST /api/ai/generate`，请求体 `mode: 'image'`、`prompt: '连接测试'`、空参考、当前配置，
成功显示「连接成功」，失败显示 `error` 字段内容。API Key 输入框用 `type="password"`。

- [ ] **Step 5: 运行测试并手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test; pnpm dev
```

打开 `/settings` 保存配置 → 刷新后仍在；模拟模式下「测试连接」返回成功。

- [ ] **Step 6: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: custom ai provider settings"
```

---

### Task 14: 服务端 AI 路由与供应商适配层

**Files:**
- Create: `src/lib/ai/provider.ts`
- Test: `src/lib/ai/provider.test.ts`
- Create: `src/app/api/ai/generate/route.ts`
- Test: `src/app/api/ai/generate/route.test.ts`

**Interfaces:**
- Consumes: `AiConfig`、`AiImageReference`（Task 13）、`createSupabaseServerClient`（Task 3）
- Produces:

```ts
export function buildPrompt(prompt: string, texts: string[]): string;
export function mockImageDataUrl(text: string): string;
export function dataUrlToBlob(dataUrl: string): Blob;
export async function generateImage(config: AiConfig, input: {
  prompt: string; texts: string[]; images: AiImageReference[]; size: string;
}): Promise<{ imageSrc: string }>;
export async function generateText(config: AiConfig, input: {
  prompt: string; texts: string[]; images: AiImageReference[];
}): Promise<{ text: string }>;
```

  `POST /api/ai/generate`：成功 `200`；参数非法 `400`；未登录 `401`；上游失败 `502`。

- [ ] **Step 1: 写失败测试**

`src/lib/ai/provider.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrompt, generateImage, generateText, mockImageDataUrl } from './provider';
import { DEFAULT_AI_SETTINGS } from './settings';

const mockConfig = { ...DEFAULT_AI_SETTINGS, provider: 'mock' as const };
const openAiConfig = {
  ...DEFAULT_AI_SETTINGS, provider: 'openai-compatible' as const,
  baseUrl: 'https://api.test/v1', apiKey: 'k', imageModel: 'm',
};

describe('buildPrompt', () => {
  it('把参考文本拼进提示词', () => {
    expect(buildPrompt('一只柴犬', ['水彩风格', '高细节'])).toBe('一只柴犬\n\n参考信息：\n- 水彩风格\n- 高细节');
  });
  it('没有参考文本时保持原样', () => {
    expect(buildPrompt('一只柴犬', [])).toBe('一只柴犬');
  });
});

describe('mock 模式', () => {
  it('返回可渲染的 svg data url', async () => {
    const { imageSrc } = await generateImage(mockConfig, { prompt: '猫', texts: [], images: [], size: '1024x1024' });
    expect(imageSrc.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(imageSrc)).toContain('猫');
  });
  it('同一输入生成稳定结果', () => {
    expect(mockImageDataUrl('x')).toBe(mockImageDataUrl('x'));
  });
  it('文本模式回显提示词', async () => {
    const { text } = await generateText(mockConfig, { prompt: '写一句', texts: ['参考'], images: [] });
    expect(text).toContain('写一句');
  });
});

describe('openai 兼容模式', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('无参考图时调用 /images/generations 并解析 b64_json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'AAA' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { imageSrc } = await generateImage(openAiConfig, { prompt: '猫', texts: [], images: [], size: '1024x1024' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/images/generations');
    expect(imageSrc).toBe('data:image/png;base64,AAA');
  });

  it('有参考图时改调 /images/edits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'BBB' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await generateImage(openAiConfig, {
      prompt: '改造', texts: [], size: '1024x1024',
      images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/images/edits');
  });

  it('上游非 2xx 时抛出带状态码的错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })));
    await expect(generateImage(openAiConfig, { prompt: '猫', texts: [], images: [], size: '1024x1024' }))
      .rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/ai/provider.test.ts
```

Expected: FAIL，找不到模块。

- [ ] **Step 3: 写 provider 实现**

`src/lib/ai/provider.ts`：

```ts
import type { AiConfig, AiImageReference } from './types';

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export function buildPrompt(prompt: string, texts: string[]): string {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return prompt;
  return `${prompt}\n\n参考信息：\n${clean.map((t) => `- ${t}`).join('\n')}`;
}

export function mockImageDataUrl(text: string): string {
  const label = escapeXml(text.replace(/\s+/g, ' ').slice(0, 40));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#eef2ff"/><text x="50%" y="50%" text-anchor="middle" font-size="22" fill="#334155">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function readImageResponse(res: Response): Promise<{ imageSrc: string }> {
  if (!res.ok) throw new Error(`AI 接口请求失败（${res.status}）：${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = json.data?.[0];
  if (first?.b64_json) return { imageSrc: `data:image/png;base64,${first.b64_json}` };
  if (first?.url) return { imageSrc: first.url };
  throw new Error('AI 接口返回里没有图片数据');
}

export async function generateImage(
  config: AiConfig,
  input: { prompt: string; texts: string[]; images: AiImageReference[]; size: string },
): Promise<{ imageSrc: string }> {
  const prompt = buildPrompt(input.prompt, input.texts);
  if (config.provider === 'mock') return { imageSrc: mockImageDataUrl(prompt) };

  const base = config.baseUrl.replace(/\/+$/, '');
  if (input.images.length === 0) {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.imageModel, prompt, size: input.size, n: 1 }),
    });
    return readImageResponse(res);
  }

  const form = new FormData();
  form.append('model', config.imageModel);
  form.append('prompt', prompt);
  form.append('size', input.size);
  input.images.forEach((image, index) => {
    const field = input.images.length > 1 ? 'image[]' : 'image';
    form.append(field, dataUrlToBlob(image.dataUrl), `${index}.png`);
  });
  const res = await fetch(`${base}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });
  return readImageResponse(res);
}

export async function generateText(
  config: AiConfig,
  input: { prompt: string; texts: string[]; images: AiImageReference[] },
): Promise<{ text: string }> {
  const prompt = buildPrompt(input.prompt, input.texts);
  if (config.provider === 'mock') return { text: `【模拟输出】${prompt}` };

  const base = config.baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.textModel, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AI 文本接口请求失败（${res.status}）：${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: json.choices?.[0]?.message?.content ?? '' };
}
```

- [ ] **Step 4: 运行 provider 测试确认通过**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/ai/provider.test.ts
```

Expected: 7 个用例 PASS。

- [ ] **Step 5: 写路由与路由测试**

`src/app/api/ai/generate/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateImage, generateText } from '@/lib/ai/provider';

const configSchema = z.object({
  provider: z.enum(['openai-compatible', 'mock']),
  baseUrl: z.string(), apiKey: z.string(), imageModel: z.string(),
  textModel: z.string(), imageSize: z.string(),
});

const bodySchema = z.object({
  mode: z.enum(['image', 'text']),
  nodeId: z.string().min(1),
  prompt: z.string().min(1, '提示词不能为空'),
  references: z.object({
    texts: z.array(z.string()),
    images: z.array(z.object({ name: z.string(), dataUrl: z.string() })),
  }),
  size: z.string().optional(),
  config: configSchema,
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '请求参数不正确' }, { status: 400 });
  }

  const body = parsed.data;
  try {
    if (body.mode === 'image') {
      const result = await generateImage(body.config, {
        prompt: body.prompt, texts: body.references.texts, images: body.references.images,
        size: body.size ?? body.config.imageSize,
      });
      return NextResponse.json(result);
    }
    const result = await generateText(body.config, {
      prompt: body.prompt, texts: body.references.texts, images: body.references.images,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '生成失败' }, { status: 502 });
  }
}
```

`src/app/api/ai/generate/route.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

import { POST } from './route';

const validBody = {
  mode: 'image', nodeId: 'n1', prompt: '猫',
  references: { texts: [], images: [] },
  config: { provider: 'mock', baseUrl: '', apiKey: '', imageModel: 'm', textModel: 't', imageSize: '1024x1024' },
};
const req = (body: unknown) => new Request('http://localhost/api/ai/generate', {
  method: 'POST', body: JSON.stringify(body),
});

describe('POST /api/ai/generate', () => {
  beforeEach(() => getUser.mockReset());

  it('未登录返回 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req(validBody))).status).toBe(401);
  });

  it('提示词为空返回 400', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect((await POST(req({ ...validBody, prompt: '' }))).status).toBe(400);
  });

  it('模拟模式返回图片', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(String((await res.json()).imageSrc)).toContain('data:image/svg+xml');
  });
});
```

- [ ] **Step 6: 运行全部测试并提交**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test
cd "D:\react flow"; git add -A; git commit -m "feat: server side ai route with provider adapter"
```

Expected: 全部 PASS。

---

### Task 15: 节点级 AI 对话框（连线参考 → 生成 → 写回节点）

**Files:**
- Create: `src/lib/ai/image.ts`
- Create: `src/components/canvas/NodeAiPanel.tsx`
- Test: `src/components/canvas/NodeAiPanel.test.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `src/components/canvas/NodeContextMenu.tsx`（「用此图生成」触发面板）

**Interfaces:**
- Consumes: `resolveReferences`（Task 5）、`loadAiSettings`（Task 13）、`POST /api/ai/generate`（Task 14）、`useCanvasStore`
- Produces:

```ts
export async function toDataUrl(src: string): Promise<string>;
export function NodeAiPanel(props: { nodeId: string; onClose: () => void }): JSX.Element | null;
```

  行为：面板展示该节点入边参考与自身对话历史；提交后把用户消息和结果消息写入
  `node.data.ai.messages`；图片结果写入图片节点 `src`，文本结果写入文本节点 `text`；
  整个过程可撤销。

- [ ] **Step 1: 写失败测试**

`src/components/canvas/NodeAiPanel.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeAiPanel } from './NodeAiPanel';
import { useCanvasStore } from '@/lib/canvas/store';

const s = () => useCanvasStore.getState();
const svgDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

describe('NodeAiPanel', () => {
  beforeEach(() => {
    s().reset();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('展示入边参考来源', () => {
    const ref = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(ref, { text: '水彩风格' });
    const target = s().addImageNode({ x: 300, y: 0 });
    s().onConnect({ source: ref, target, sourceHandle: null, targetHandle: null });
    render(<NodeAiPanel nodeId={target} onClose={() => {}} />);
    expect(screen.getByText('水彩风格')).toBeInTheDocument();
  });

  it('生成成功后写回图片并记录两条对话', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageSrc: svgDataUrl }), { status: 200 }),
    ));
    const id = s().addImageNode({ x: 0, y: 0 });
    render(<NodeAiPanel nodeId={id} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('提示词'), '一只柴犬');
    await userEvent.click(screen.getByRole('button', { name: '生成' }));
    await waitFor(() => {
      const data = s().nodes.find((n) => n.id === id)!.data as { src: string | null; ai: { messages: unknown[] } };
      expect(data.src).toContain('data:image/svg+xml');
      expect(data.ai.messages).toHaveLength(2);
    });
  });

  it('失败时显示错误信息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: '上游 401' }), { status: 502 }),
    ));
    const id = s().addImageNode({ x: 0, y: 0 });
    render(<NodeAiPanel nodeId={id} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('提示词'), '猫');
    await userEvent.click(screen.getByRole('button', { name: '生成' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('上游 401');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/components/canvas/NodeAiPanel.test.tsx
```

Expected: FAIL，找不到模块。

- [ ] **Step 3: 写参考图转换工具**

`src/lib/ai/image.ts`：

```ts
export async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`参考图读取失败（${res.status}）`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('参考图转换失败'));
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 4: 写面板组件**

`src/components/canvas/NodeAiPanel.tsx`：

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useCanvasStore } from '@/lib/canvas/store';
import { resolveReferences } from '@/lib/canvas/graph';
import { loadAiSettings } from '@/lib/ai/settings';
import { toDataUrl } from '@/lib/ai/image';
import type { AiMessage } from '@/lib/canvas/types';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random()}`); 

export function NodeAiPanel({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const node = nodes.find((n) => n.id === nodeId);
  const bundle = useMemo(() => resolveReferences(nodeId, nodes, edges), [nodeId, nodes, edges]);
  if (!node) return null;

  const mode = node.type === 'image' ? 'image' : 'text';
  const history = node.data.ai.messages;
  const config = loadAiSettings();

  async function submit() {
    setBusy(true);
    setError(null);
    const images = await Promise.all(
      bundle.images.map(async (item) => ({ name: item.nodeId, dataUrl: await toDataUrl(item.src) })),
    );
    const userMessage: AiMessage = {
      id: newId(), role: 'user', text: prompt, createdAt: new Date().toISOString(),
    };
    updateNodeData(nodeId, { ai: { messages: [...history, userMessage], status: 'running' } } as never);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, nodeId, prompt, size: config.imageSize, config,
          references: { texts: bundle.texts.map((t) => t.text), images },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '生成失败');

      const assistantMessage: AiMessage = {
        id: newId(), role: 'assistant',
        text: json.text ?? prompt, imageSrc: json.imageSrc, createdAt: new Date().toISOString(),
      };
      const messages = [...history, userMessage, assistantMessage];
      updateNodeData(nodeId, mode === 'image'
        ? { src: json.imageSrc, ai: { messages, status: 'idle' } } as never
        : { text: json.text, ai: { messages, status: 'idle' } } as never);
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成失败';
      setError(message);
      updateNodeData(nodeId, { ai: { messages: history, status: 'error', error: message } } as never);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-dvh w-80 flex-col gap-3 border-l bg-white p-3 shadow-xl">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">节点 AI · {nodeId}</h2>
        <button type="button" onClick={onClose} aria-label="关闭面板" className="text-xs text-gray-500">关闭</button>
      </header>

      <section>
        <h3 className="mb-1 text-xs font-medium text-gray-500">参考素材</h3>
        {bundle.sources.length === 0 && <p className="text-xs text-gray-400">暂无连线参考，可从其它节点连线到此节点</p>}
        <ul className="space-y-1 text-xs">
          {bundle.texts.map((t) => <li key={t.nodeId} data-node-id={t.nodeId} className="rounded bg-gray-50 p-1">{t.text}</li>)}
          {bundle.images.map((i) => (
            <li key={i.nodeId} data-node-id={i.nodeId} className="rounded bg-gray-50 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.src} alt={i.alt} className="h-16 w-16 object-cover" />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex-1 overflow-y-auto">
        <h3 className="mb-1 text-xs font-medium text-gray-500">本节点对话</h3>
        <ul className="space-y-2 text-xs">
          {history.map((m) => (
            <li key={m.id} className={m.role === 'user' ? 'text-gray-900' : 'text-indigo-700'}>
              <span className="mr-1 font-medium">{m.role === 'user' ? '我' : 'AI'}：</span>{m.text}
              {m.imageSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageSrc} alt="生成结果" className="mt-1 h-24 w-24 object-cover" />
              )}
            </li>
          ))}
        </ul>
      </section>

      <textarea
        aria-label="提示词" value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述你想生成的内容，留空则使用参考文本"
        className="h-20 w-full resize-none rounded border p-2 text-sm"
      />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button
        type="button" disabled={busy} onClick={submit}
        className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? '生成中…' : '生成'}
      </button>
    </aside>
  );
}
```

补充规则（实现时遵守）：提示词为空时用 `bundle.texts` 拼接作为 prompt（若都为空则按钮禁用并
提示「请输入提示词或连接一个文本节点」）；参考图存在时走图生图。

- [ ] **Step 5: 挂到画布并替换占位**

`CanvasWorkspace` 中把 Task 11 的 `NodeAiPanel` 占位替换为真实组件；
节点右键菜单的「用此图生成」保持调用 `onRequestAiPanel(node.id)`。

- [ ] **Step 6: 运行测试并手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test; pnpm dev
```

模拟模式闭环：文本节点写「水彩风格」→ 图片节点 ← 连线 → 右键图片节点「用此图生成」→
点「生成」→ 节点显示占位图、面板多出两条对话 → `Ctrl+Z` 回到生成前。
配好真实 API 后再跑一次，应返回真实图片。

- [ ] **Step 7: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: per-node ai panel driven by edge references"
```

---

### Task 16: 项目云端保存与本地草稿

**Files:**
- Create: `src/lib/canvas/localDraft.ts`
- Test: `src/lib/canvas/localDraft.test.ts`
- Create: `src/lib/projects/api.ts`
- Create: `src/app/projects/page.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`（顶栏：项目名、保存状态、保存按钮）

**Interfaces:**
- Consumes: `buildCanvasFile` / `parseCanvasFile` / `serializeCanvasFile`（Task 7）、`createSupabaseBrowserClient`（Task 3）
- Produces:

```ts
export const DRAFT_KEY = 'ai-canvas:draft';
export function saveDraft(file: CanvasFile): void;
export function loadDraft(): CanvasFile | null;
export function clearDraft(): void;

export type ProjectRow = {
  id: string; name: string;
  graph: { nodes: unknown[]; edges: unknown[] };
  updated_at: string;
};
export async function listProjects(): Promise<ProjectRow[]>;
export async function createProject(name: string, file: CanvasFile): Promise<ProjectRow>;
export async function updateProject(id: string, file: CanvasFile, name?: string): Promise<void>;
export async function deleteProject(id: string): Promise<void>;
export async function loadProjectGraph(id: string): Promise<CanvasFile>;
```

- [ ] **Step 1: 写失败测试**

`src/lib/canvas/localDraft.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft } from './localDraft';
import { buildCanvasFile } from './serialization';

const file = buildCanvasFile({
  name: '草稿', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 },
});

describe('本地草稿', () => {
  beforeEach(() => localStorage.clear());

  it('保存后可读回', () => {
    saveDraft(file);
    expect(loadDraft()?.name).toBe('草稿');
    expect(localStorage.getItem(DRAFT_KEY)).toContain('"version": 1');
  });

  it('没有草稿时返回 null', () => {
    expect(loadDraft()).toBeNull();
  });

  it('草稿损坏时返回 null 而不抛错', () => {
    localStorage.setItem(DRAFT_KEY, '{broken');
    expect(loadDraft()).toBeNull();
  });

  it('可以清除草稿', () => {
    saveDraft(file);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm vitest run src/lib/canvas/localDraft.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/lib/canvas/localDraft.ts`：

```ts
import { parseCanvasFile, serializeCanvasFile } from './serialization';
import type { CanvasFile } from './types';

export const DRAFT_KEY = 'ai-canvas:draft';

export function saveDraft(file: CanvasFile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DRAFT_KEY, serializeCanvasFile(file));
}

export function loadDraft(): CanvasFile | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return parseCanvasFile(raw);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}
```

`src/lib/projects/api.ts`：

```ts
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { parseCanvasFile, serializeCanvasFile } from '@/lib/canvas/serialization';
import type { CanvasFile } from '@/lib/canvas/types';

export type ProjectRow = {
  id: string; name: string;
  graph: { nodes: unknown[]; edges: unknown[] };
  updated_at: string;
};

const COLUMNS = 'id, name, graph, updated_at';

export async function listProjects(): Promise<ProjectRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from('projects')
    .select(COLUMNS).order('updated_at', { ascending: false });
  if (error) throw new Error(`读取画布列表失败：${error.message}`);
  return (data ?? []) as ProjectRow[];
}

export async function createProject(name: string, file: CanvasFile): Promise<ProjectRow> {
  const supabase = createSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录');
  const { data, error } = await supabase.from('projects')
    .insert({ user_id: user.id, name, graph: { nodes: file.nodes, edges: file.edges } })
    .select(COLUMNS).single();
  if (error) throw new Error(`保存失败：${error.message}`);
  return data as ProjectRow;
}

export async function updateProject(id: string, file: CanvasFile, name?: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from('projects')
    .update({ graph: { nodes: file.nodes, edges: file.edges }, ...(name ? { name } : {}), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`保存失败：${error.message}`);
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`删除失败：${error.message}`);
}

export async function loadProjectGraph(id: string): Promise<CanvasFile> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from('projects').select(COLUMNS).eq('id', id).single();
  if (error) throw new Error(`打开画布失败：${error.message}`);
  const row = data as ProjectRow;
  const payload = JSON.stringify({
    version: 1, name: row.name, exportedAt: row.updated_at,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: row.graph.nodes ?? [], edges: row.graph.edges ?? [],
  });
  return parseCanvasFile(payload);
}
```

（`serializeCanvasFile` 用于导出与草稿，这里保留导入以便后续导入功能复用。）

- [ ] **Step 4: 接入工作区与项目页**

- 进 `/canvas`：URL 带 `?project=<id>` 时用 `loadProjectGraph` 载入并 `store.loadCanvas(file)`，
  否则尝试 `loadDraft()` 恢复本地草稿。
- 画布变化后 1.5 秒防抖 `saveDraft(buildCanvasFile({ name, nodes, edges, viewport }))`。
- 顶栏按钮「保存到云端」：无项目 id 时 `createProject`，有则 `updateProject`；
  顶部状态文案固定四种：`未保存` / `已保存到本地` / `已保存到云端` / `保存失败`。
- `/projects` 页面：列出项目（名称 + 更新时间 + 打开 + 删除），空态显示「还没有画布，去新建」，
  「新建画布」跳 `/canvas`。

- [ ] **Step 5: 运行测试并手动验证**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm test; pnpm dev
```

建画布并加节点 → 关浏览器 → 重开 `/canvas` 内容仍在 → 点保存 → `/projects` 能看到 →
打开内容一致 → 删除后列表消失。

- [ ] **Step 6: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "feat: cloud project persistence with local draft"
```

---

### Task 17: 端到端冒烟测试与部署说明

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/canvas.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: 前面全部任务
- Produces: `pnpm e2e` 可运行的冒烟用例；README 含 Supabase 与 Vercel 配置步骤

- [ ] **Step 1: 安装 Playwright（需要联网授权）**

```powershell
cd "D:\react flow\ai-canvas-studio"; pnpm add -D @playwright/test; pnpm exec playwright install chromium
```

- [ ] **Step 2: 写配置与用例**

`playwright.config.ts`：

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true },
});
```

`e2e/canvas.spec.ts`：

```ts
import { expect, test } from '@playwright/test';

const svgDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

test('画布核心流程', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, '需要 E2E_EMAIL / E2E_PASSWORD 测试账号');

  await page.route('**/api/ai/generate', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ imageSrc: svgDataUrl }),
  }));

  await page.goto('/login');
  await page.getByLabel('邮箱').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('密码').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/canvas');

  await page.getByRole('button', { name: '添加文本节点' }).click();
  await page.getByRole('button', { name: '添加图片节点' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByRole('button', { name: '重做' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);

  const download = page.waitForEvent('download');
  await page.locator('.react-flow__pane').click({ button: 'right' });
  await page.getByRole('button', { name: '导出画布 JSON' }).click();
  expect((await download).suggestedFilename()).toContain('canvas-');
});
```

- [ ] **Step 3: 运行冒烟测试**

```powershell
cd "D:\react flow\ai-canvas-studio"
$env:E2E_EMAIL="<测试账号>"; $env:E2E_PASSWORD="<密码>"
pnpm exec playwright test
```

Expected: 1 passed（未提供账号时按 skip 规则跳过）。

- [ ] **Step 4: 写 README**

必须包含：项目简介与功能清单、本地启动（`pnpm install` → 配 `.env.local` 两个变量 → `pnpm dev`）、
Supabase 初始化（执行 `supabase/schema.sql`、开启 Email 登录、把 `http://localhost:3000/auth/callback`
加入重定向白名单）、自定义 API 说明（`/settings` 里填 Base URL / Key / 图片模型 / 文本模型 / 尺寸；
未配置时走模拟模式）、部署到 Vercel（导入仓库 → 填两个环境变量 → 把线上域名回调地址加入
Supabase 白名单）、常见问题（收不到确认邮件、签名 URL 过期、生成 401/502 排查、`pnpm test` 失败怎么办）。

- [ ] **Step 5: 提交**

```powershell
cd "D:\react flow"; git add -A; git commit -m "test: e2e smoke test and deployment docs"
```

---

## 完成标准（Definition of Done）

1. `pnpm test`、`pnpm typecheck`、`pnpm exec playwright test` 全部通过。
2. 邮箱注册 → 收信确认 → 登录 → 进画布全流程可用。
3. 画布功能逐条可验收：选择工具、抓手工具、添加图片节点、添加文本节点、撤销、重做、
   删除选中节点、清空画布（左侧最下面）、Delete 删除、双击编辑文本、点击上传图片、
   拖拽调整节点大小、节点连线、网格吸附、空白处右键加节点、节点右键删除与用此图生成、
   六种对齐（左/右/居中/顶/底/垂直居中）、文生图、图生图、导出画布 JSON、
   自定义 API 设置、每节点独立 AI 对话框、文本与图片节点都可作为连线参考。
4. 云端保存与本地草稿都可用：刷新或重开浏览器不丢内容，`/projects` 能管理画布。
