'use client';

import type { LocalCanvas } from '@/lib/canvas/localCanvases';

/** 顶部标签栏：一张画布一个标签，右边一个加号直接新建。 */
export function CanvasTabs({
  canvases,
  open,
  activeId,
  onActivate,
  onClose,
  onCreate,
}: {
  canvases: LocalCanvas[];
  open: string[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
}) {
  const byId = new Map(canvases.map((canvas) => [canvas.id, canvas]));

  return (
    <div data-testid="canvas-tabs" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {open.map((id) => {
        const canvas = byId.get(id);
        if (!canvas) return null;
        const active = id === activeId;
        return (
          <span
            key={id}
            className={[
              'flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs',
              active
                ? 'border-gray-400 bg-white font-medium text-gray-900'
                : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            <button
              type="button"
              aria-label={`切换到画布 ${canvas.name}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onActivate(id)}
              className="max-w-32 truncate"
            >
              {canvas.name}
            </button>
            <button
              type="button"
              aria-label={`关闭 ${canvas.name}`}
              title="关闭标签（画布留在本地，之后还能打开）"
              onClick={() => onClose(id)}
              className="rounded px-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            >
              ×
            </button>
          </span>
        );
      })}

      <button
        type="button"
        aria-label="新建画布"
        title="新建画布"
        onClick={onCreate}
        className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        ＋
      </button>
    </div>
  );
}
