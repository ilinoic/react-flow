-- AI 画布工作台：Supabase 初始化脚本
-- 用法：Supabase 控制台 → SQL Editor → 新建查询 → 粘贴全文 → Run

-- 1) 画布项目表
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

-- 2) 私有图片桶（画布里的图片节点上传到此）
insert into storage.buckets (id, name, public)
values ('canvas-images', 'canvas-images', false)
on conflict (id) do nothing;

drop policy if exists "own canvas images" on storage.objects;
create policy "own canvas images" on storage.objects
  for all
  using (bucket_id = 'canvas-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'canvas-images' and (storage.foldername(name))[1] = auth.uid()::text);
