'use client';

import { useEffect, useRef, useState } from 'react';
import { CANVAS_TEMPLATES, type CanvasTemplate } from '@/lib/canvas/templates';

/** 标签栏右边的「模板」：挑一个模板，开成一张新的画布标签，当前画布不动。 */
export function TemplateMenu({
  onOpenTemplate,
}: {
  onOpenTemplate: (template: CanvasTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div ref={containerRef} className="relative shrink-0">
      {open && (
        <div
          data-testid="template-menu"
          // 要压在右上角「画布名 / 保存到云端」那一行（z-20）上面，否则菜单展开后被它挡住点不到。
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-gray-200 bg-white/95 p-2 text-sm shadow-lg"
        >
          <p className="px-1 pb-1 text-[11px] text-gray-400">画布模板（点一下开成新标签）</p>
          <ul>
            {CANVAS_TEMPLATES.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  aria-label={`从模板打开 ${template.name}`}
                  onClick={() => {
                    setOpen(false);
                    onOpenTemplate(template);
                  }}
                  className="block w-full rounded px-1 py-1 text-left hover:bg-gray-100"
                >
                  <span className="block truncate text-gray-800">{template.name}</span>
                  <span className="block truncate text-[10px] text-gray-400">{template.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        aria-label="画布模板"
        aria-expanded={open}
        title="从模板开一张新的画布"
        onClick={() => setOpen((value) => !value)}
        className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        模板
      </button>
    </div>
  );
}
