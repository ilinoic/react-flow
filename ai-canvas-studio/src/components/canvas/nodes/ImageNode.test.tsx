import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ImageNode } from './ImageNode';
import { useCanvasStore } from '@/lib/canvas/store';
import type { CanvasNode } from '@/lib/canvas/types';

const s = () => useCanvasStore.getState();

function setup() {
  const id = s().addImageNode({ x: 0, y: 0 });
  const node = s().nodes.find((item) => item.id === id)!;
  const props = {
    id,
    data: node.data,
    selected: false,
    type: 'image',
    position: node.position,
    width: 240,
    height: 240,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    draggable: true,
    selectable: true,
    deletable: true,
    focusable: true,
    parentId: undefined,
  } as unknown as NodeProps<CanvasNode>;

  render(
    <ReactFlowProvider>
      <ImageNode {...props} />
    </ReactFlowProvider>,
  );
  return id;
}

describe('ImageNode', () => {
  beforeEach(() => s().reset());

  it('未上传时显示上传按钮', () => {
    setup();
    expect(document.querySelector('[data-testid="image-node-body"]')).not.toBeNull();
    expect(document.querySelector('label')?.textContent).toContain('点击上传图片');
  });

  it('连接点在左右两侧中部', () => {
    setup();
    expect(document.querySelector('.react-flow__handle-left')).not.toBeNull();
    expect(document.querySelector('.react-flow__handle-right')).not.toBeNull();
    expect(document.querySelector('.react-flow__handle-top')).toBeNull();
    expect(document.querySelector('.react-flow__handle-bottom')).toBeNull();
  });

  it('点击节点上的 AI 按钮会打开该节点的对话框', async () => {
    const id = setup();
    await userEvent.click(document.querySelector('[aria-label="打开 AI 对话框"]')!);
    expect(s().aiPanelNodeId).toBe(id);
  });
});
