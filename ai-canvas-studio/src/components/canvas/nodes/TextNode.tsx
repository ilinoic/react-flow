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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const commitHistory = useCanvasStore((state) => state.commitHistory);
  const openAiPanel = useCanvasStore((state) => state.openAiPanel);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

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
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <button
        type="button"
        aria-label="打开 AI 对话框"
        title="打开 AI 对话框"
        onClick={(event) => {
          event.stopPropagation();
          openAiPanel(id);
        }}
        className="nodrag absolute -top-2 -right-2 z-10 rounded-full border border-gray-300 bg-white/95 px-1.5 py-0.5 text-[10px] text-gray-600 shadow hover:bg-gray-100"
      >
        AI
      </button>
      <div
        data-testid="text-node-body"
        onDoubleClick={() => {
          setDraft(text);
          setEditing(true);
        }}
        className="h-full w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 shadow-sm"
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            aria-label="文本节点内容"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraft(text);
                setEditing(false);
              }
            }}
            className="h-full w-full resize-none border-none bg-transparent outline-none"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        )}
      </div>
    </>
  );
}
