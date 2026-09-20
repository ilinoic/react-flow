import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { buildCanvasFile, parseCanvasFile } from '@/lib/canvas/serialization';
import type { CanvasFile } from '@/lib/canvas/types';

export type ProjectRow = {
  id: string;
  name: string;
  graph: { nodes: unknown[]; edges: unknown[] };
  updated_at: string;
};

const COLUMNS = 'id, name, graph, updated_at';

export async function listProjects(): Promise<ProjectRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('projects')
    .select(COLUMNS)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`读取画布列表失败：${error.message}`);
  return (data ?? []) as ProjectRow[];
}

export async function createProject(name: string, file: CanvasFile): Promise<ProjectRow> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录');

  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: user.id, name, graph: { nodes: file.nodes, edges: file.edges } })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`保存失败：${error.message}`);
  return data as ProjectRow;
}

export async function updateProject(id: string, file: CanvasFile, name?: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from('projects')
    .update({
      graph: { nodes: file.nodes, edges: file.edges },
      ...(name ? { name } : {}),
      updated_at: new Date().toISOString(),
    })
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
  return parseCanvasFile(
    JSON.stringify(
      buildCanvasFile({
        name: row.name,
        nodes: (row.graph.nodes ?? []) as CanvasFile['nodes'],
        edges: (row.graph.edges ?? []) as CanvasFile['edges'],
        viewport: { x: 0, y: 0, zoom: 1 },
        now: new Date(row.updated_at),
      }),
    ),
  );
}
