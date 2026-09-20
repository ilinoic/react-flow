'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  deleteProject,
  listProjects,
  type ProjectRow,
} from '@/lib/projects/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listProjects());
    } catch (listError) {
      setError(listError instanceof Error ? listError.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const rows = await listProjects();
        if (cancelled) return;
        setProjects(rows);
      } catch (listError) {
        if (cancelled) return;
        setError(listError instanceof Error ? listError.message : '读取失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`删除画布「${name}」？此操作不可撤销。`)) return;
    try {
      await deleteProject(id);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">我的画布</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/canvas" className="text-gray-500 hover:text-gray-900">
            新建 / 返回画布
          </Link>
          <Link href="/settings" className="text-gray-500 hover:text-gray-900">
            AI 设置
          </Link>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && projects.length === 0 && !error && (
        <p className="text-sm text-gray-500">还没有画布，去新建一个吧</p>
      )}

      <ul className="w-full max-w-2xl divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {projects.map((project) => (
          <li key={project.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="flex flex-col">
              <span className="font-medium text-gray-900">{project.name}</span>
              <span className="text-xs text-gray-500">
                更新于 {new Date(project.updated_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/canvas?project=${project.id}`}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
              >
                打开
              </Link>
              <button
                type="button"
                onClick={() => onDelete(project.id, project.name)}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
