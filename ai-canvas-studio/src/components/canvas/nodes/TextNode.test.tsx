import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { TextNode } from './TextNode';
import { useCanvasStore } from '@/lib/canvas/store';
import type { CanvasNode } from '@/lib/canvas/types';

const s = () => useCanvasStore.getState();

function setup() {
  const id = s().addTextNode({ x: 0, y: 0 });
  const node = s().nodes.find((item) => item.id === id)!;
  const props = {
    id,
    data: node.data,
    selected: false,
    type: 'text',
    position: node.position,
    width: 240,
    height: 120,
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
      <TextNode {...props} />
    </ReactFlowProvider>,
  );
  return id;
}

describe('TextNode', () => {
  beforeEach(() => s().reset());

  it('双击后显示可编辑输入框', async () => {
    setup();
    await userEvent.dblClick(screen.getByTestId('text-node-body'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('输入内容并失焦后写回 store 且可撤销', async () => {
    const id = setup();
    await userEvent.dblClick(screen.getByTestId('text-node-body'));
    await userEvent.type(screen.getByRole('textbox'), '水彩风格');
    await userEvent.tab();

    expect((s().nodes.find((item) => item.id === id)!.data as { text: string }).text).toBe('水彩风格');

    s().undo();
    expect((s().nodes.find((item) => item.id === id)!.data as { text: string }).text).toBe('');
  });
});
