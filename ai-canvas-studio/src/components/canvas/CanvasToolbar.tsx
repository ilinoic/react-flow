'use client';

import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@/lib/canvas/store';
import { importCanvasFile } from '@/lib/canvas/importCanvas';
import { clearClipboard } from '@/lib/canvas/clipboard';

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
  onFitView,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  addPosition: () => { x: number; y: number };
  onFitView: () => void;
}) {
  const nodes = useCanvasStore((state) => state.nodes);
  const canUndo = useCanvasStore((state) => state.past.length > 0);
  const canRedo = useCanvasStore((state) => state.future.length > 0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id);

  // 二次确认只给几秒，避免过一会儿再点一下就真把画布清空。
  useEffect(() => {
    if (!confirmingClear) return;
    const timer = setTimeout(() => setConfirmingClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  async function onImportFile(file: File) {
    const result = await importCanvasFile(file);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setImportError(null);
    useCanvasStore.getState().loadCanvas(result.file);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (editing) {
        // 在输入框里复制/剪切文字，说明用户这会儿要的是文字：
        // 把节点剪贴板清掉，免得回到画布按 Ctrl+V 时粘出上一次复制的节点。
        if (mod && (key === 'c' || key === 'x')) clearClipboard();
        return;
      }

      const store = useCanvasStore.getState();

      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        store.copySelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        store.cutSelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        store.pasteClipboard();
        return;
      }

      if (!mod && (event.key === 'v' || event.key === 'V')) onToolChange('select');
      if (!mod && (event.key === 'h' || event.key === 'H')) onToolChange('hand');

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
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        store.onNodesChange(
          store.nodes.map((node) => ({ id: node.id, type: 'select' as const, selected: true })),
        );
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const targets = store.nodes.filter((node) => node.selected).map((node) => node.id);
        targets.forEach((id) => store.duplicateNode(id));
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        onFitView();
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
  }, [onToolChange, onFitView]);

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
      <ToolButton label="添加参考图片节点" onClick={() => useCanvasStore.getState().addReferenceNode(addPosition())} />
      <ToolButton label="导入画布" onClick={() => fileInputRef.current?.click()} />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        aria-label="导入画布文件"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onImportFile(file);
          event.target.value = '';
        }}
      />
      {importError && <span className="text-[10px] leading-tight text-red-600">{importError}</span>}
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
