'use client';

import { useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '@/lib/canvas/store';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { uploadCanvasImage } from '@/lib/canvas/upload';
import { MIN_NODE_SIZE } from '@/lib/canvas/constants';
import { UploadImageButton } from '../UploadImageButton';
import type { CanvasNode } from '@/lib/canvas/types';

export function ImageNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const src = data.kind === 'image' ? data.src : null;
  const alt = data.kind === 'image' ? data.alt : '图片';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const commitHistory = useCanvasStore((state) => state.commitHistory);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('请先登录再上传图片');
      const uploaded = await uploadCanvasImage(file, auth.user.id);
      updateNodeData(id, { src: uploaded.src, storagePath: uploaded.path });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_SIZE.image.width}
        minHeight={MIN_NODE_SIZE.image.height}
        onResizeStart={() => commitHistory()}
      />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div
        data-testid="image-node-body"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className="h-full w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <UploadImageButton busy={busy} error={error} onPick={handleFile} />
        )}
      </div>
    </>
  );
}
