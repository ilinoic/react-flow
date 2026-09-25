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
  const selectedCount = useCanvasStore((state) => state.nodes.filter((node) => node.selected).length);
  const alignSelection = useCanvasStore((state) => state.alignSelection);

  if (selectedCount < 2) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-1 shadow">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          title={item.label}
          aria-label={item.label}
          onClick={() => alignSelection(item.key)}
          className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
