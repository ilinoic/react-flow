'use client';

import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { MIN_NODE_SIZE } from '@/lib/canvas/constants';
import { NodeAiPrompt } from '../NodeAiPrompt';
import type { CanvasNode } from '@/lib/canvas/types';

export function TextNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const text = data.kind === 'text' ? data.text : '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const commitHistory = useCanvasStore((state) => state.commitHistory);

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
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-gray-300 bg-white text-sm text-gray-900 shadow-sm">
        <div
          data-testid="text-node-body"
          onDoubleClick={() => {
            setDraft(text);
            setEditing(true);
          }}
          className="min-h-0 flex-1 overflow-auto p-2"
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
        {/* 文本节点出的是文字，参考图只有出图时才用得上，所以这里不放那一格。 */}
        <NodeAiPrompt nodeId={id} showReferenceSlot={false} />
      </div>
    </>
  );
}
