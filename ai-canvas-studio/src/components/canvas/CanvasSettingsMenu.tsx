'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LocalCanvas } from '@/lib/canvas/localCanvases';

/** 左下角的「设置」：把 AI 设置、云端画布和本地画布都收进这里，顶部留给标签页。 */
export function CanvasSettingsMenu({
  canvases,
  openIds,
  onOpenCanvas,
  onDeleteCanvas,
}: {
  canvases: LocalCanvas[];
  openIds: string[];
  onOpenCanvas: (id: string) => void;
  onDeleteCanvas: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 「再点一次确认」跟工具栏清空画布一个套路：过了几秒自动收回，避免过会儿一失手真删了。
  useEffect(() => {
    if (!confirmId) return;
    const timer = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmId]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="absolute bottom-3 left-3 z-20">
      {open && (
        <div
          data-testid="settings-menu"
          className="mb-2 w-60 rounded-lg border border-gray-200 bg-white/95 p-2 text-sm shadow-lg"
        >
          <p className="px-1 pb-1 text-[11px] text-gray-400">本地画布（{canvases.length}）</p>
          <ul className="max-h-64 overflow-y-auto">
            {canvases.map((canvas) => (
              <li key={canvas.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`打开 ${canvas.name}`}
                  onClick={() => {
                    onOpenCanvas(canvas.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-left hover:bg-gray-100"
                >
                  <span className="truncate text-gray-800">{canvas.name}</span>
                  <span className="shrink-0 text-[10px] text-gray-400">
                    {new Date(canvas.updatedAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {openIds.includes(canvas.id) && (
                    <span className="shrink-0 text-[10px] text-gray-400">已打开</span>
                  )}
                  {canvas.projectId && (
                    <span className="shrink-0 text-[10px] text-sky-600" title="已存到云端">
                      云端
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`删除本地画布 ${canvas.name}`}
                  title="从本地删掉这张画布（云端副本不受影响）"
                  onClick={() => {
                    if (confirmId === canvas.id) {
                      onDeleteCanvas(canvas.id);
                      setConfirmId(null);
                      return;
                    }
                    setConfirmId(canvas.id);
                  }}
                  className={[
                    'shrink-0 rounded px-1 text-xs',
                    confirmId === canvas.id
                      ? 'bg-red-50 text-red-600'
                      : 'text-gray-400 hover:bg-red-50 hover:text-red-600',
                  ].join(' ')}
                >
                  {confirmId === canvas.id ? '再点一次' : '删除'}
                </button>
              </li>
            ))}
            {canvases.length === 0 && <li className="px-1 py-1 text-xs text-gray-400">还没有本地画布</li>}
          </ul>

          <div className="my-1 h-px bg-gray-200" />

          <Link
            href="/settings"
            className="block rounded px-1 py-1 text-gray-700 hover:bg-gray-100"
            onClick={() => setOpen(false)}
          >
            AI 设置
          </Link>
          <Link
            href="/projects"
            className="block rounded px-1 py-1 text-gray-700 hover:bg-gray-100"
            onClick={() => setOpen(false)}
          >
            我的画布（云端）
          </Link>
        </div>
      )}

      <button
        type="button"
        aria-label="设置"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-gray-200 bg-white/95 px-2.5 py-1 text-xs text-gray-700 shadow hover:bg-gray-50"
      >
        ⚙ 设置
      </button>
    </div>
  );
}
