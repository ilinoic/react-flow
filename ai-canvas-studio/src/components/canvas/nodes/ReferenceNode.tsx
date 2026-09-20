'use client';

import { useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { MIN_NODE_SIZE } from '@/lib/canvas/constants';
import { toReferenceImageDataUrl } from '@/lib/canvas/referenceImage';
import { NodeAiPrompt } from '../NodeAiPrompt';
import type { CanvasNode } from '@/lib/canvas/types';

/** 参考图片节点：放参考素材用，生成的结果落到旁边的新节点，参考图不会被覆盖。 */
export function ReferenceNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const src = data.kind === 'reference' ? data.src : null;
  const [error, setError] = useState<string | null>(null);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const commitHistory = useCanvasStore((state) => state.commitHistory);

  async function handleFile(file: File) {
    setError(null);
    try {
      updateNodeData(id, { src: await toReferenceImageDataUrl(file) } as never);
    } catch {
      setError('参考图读取失败');
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_SIZE.reference.width}
        minHeight={MIN_NODE_SIZE.reference.height}
        onResizeStart={() => commitHistory()}
      />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-dashed border-indigo-300 bg-white shadow-sm">
        <div
          data-testid="reference-node-body"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          {src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="参考图" className="h-full w-full object-contain" draggable={false} />
              <button
                type="button"
                aria-label="移除参考图"
                onClick={() => updateNodeData(id, { src: null } as never)}
                className="nodrag absolute right-1 top-1 rounded border border-gray-300 bg-white/90 px-1 text-[10px] text-gray-600 hover:bg-white"
              >
                移除
              </button>
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
              <label className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                点击上传参考图
                <input
                  type="file"
                  accept="image/*"
                  aria-label="上传参考图"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.target.value = '';
                  }}
                />
              </label>
              <p className="text-center text-[10px] leading-tight text-gray-500">
                这张图只作参考，生成的结果会放到新节点
              </p>
              {error && (
                <p role="alert" className="text-[10px] text-red-600">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
        <NodeAiPrompt nodeId={id} showReferenceSlot={false} />
      </div>
    </>
  );
}
