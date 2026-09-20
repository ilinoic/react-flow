'use client';

import { useEffect, useState } from 'react';
import { useCanvasStore } from '@/lib/canvas/store';

export type CanvasTool = 'select' | 'hand';

function ToolButton({
  label,
  onClick,
  active,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-md border text-[11px] leading-none transition',
        active ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100',
        danger ? 'text-red-600' : '',
        disabled ? 'cursor-not-allowed opacity-40' : '',
      ].join(' ')}
    >
      {label.slice(0, 2)}
    </button>
  );
}

export function CanvasToolbar({
  tool,
  onToolChange,
  addPosition,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  addPosition: () => { x: number; y: number };
}) {
  const nodes = useCanvasStore((state) => state.nodes);
  const canUndo = useCanvasStore((state) => state.past.length > 0);
  const canRedo = useCanvasStore((state) => state.future.length > 0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable);
      if (editing) return;

      const store = useCanvasStore.getState();
      const mod = event.ctrlKey || event.metaKey;

      if (event.key === 'v' || event.key === 'V') onToolChange('select');
      if (event.key === 'h' || event.key === 'H') onToolChange('hand');

      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
        return;
      }
      if ((mod && event.shiftKey && event.key.toLowerCase() === 'z') || (mod && event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        store.redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const ids = store.nodes.filter((node) => node.selected).map((node) => node.id);
        if (ids.length === 0) return;
        event.preventDefault();
        store.removeNodes(ids);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToolChange]);

  return (
    <aside className="absolute left-3 top-3 z-20 flex h-[calc(100%-24px)] w-14 flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white/95 p-2 shadow">
      <ToolButton
        label="选择工具 V"
        active={tool === 'select'}
        onClick={() => onToolChange('select')}
      />
      <ToolButton label="抓手工具 H" active={tool === 'hand'} onClick={() => onToolChange('hand')} />
      <span className="my-1 h-px w-8 bg-gray-200" />
      <ToolButton label="添加文本节点" onClick={() => useCanvasStore.getState().addTextNode(addPosition())} />
      <ToolButton label="添加图片节点" onClick={() => useCanvasStore.getState().addImageNode(addPosition())} />
      <span className="my-1 h-px w-8 bg-gray-200" />
      <ToolButton label="撤销" disabled={!canUndo} onClick={() => useCanvasStore.getState().undo()} />
      <ToolButton label="重做" disabled={!canRedo} onClick={() => useCanvasStore.getState().redo()} />
      <ToolButton
        label="删除选中"
        disabled={selectedIds.length === 0}
        onClick={() => useCanvasStore.getState().removeNodes(selectedIds)}
      />

      <div className="mt-auto flex flex-col items-center gap-1">
        {confirmingClear && <span className="text-[10px] leading-tight text-red-600">再点一次确认</span>}
        <ToolButton
          label="清空画布"
          danger
          onClick={() => {
            if (confirmingClear) {
              useCanvasStore.getState().clearCanvas();
              setConfirmingClear(false);
            } else {
              setConfirmingClear(true);
            }
          }}
        />
      </div>
    </aside>
  );
}
