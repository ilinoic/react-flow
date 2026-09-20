import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { TextNode } from './TextNode';
import { useCanvasStore } from '@/lib/canvas/store';
import type { CanvasNode } from '@/lib/canvas/types';

const s = () => useCanvasStore.getState();

function renderTextNode(id: string) {
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
}

function setup() {
  const id = s().addTextNode({ x: 0, y: 0 });
  renderTextNode(id);
  return id;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('TextNode', () => {
  beforeEach(() => {
    s().reset();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('双击后显示可编辑输入框', async () => {
    setup();
    await userEvent.dblClick(screen.getByTestId('text-node-body'));
    expect(screen.getByLabelText('文本节点内容')).toBeInTheDocument();
  });

  it('输入内容并失焦后写回 store 且可撤销', async () => {
    const id = setup();
    await userEvent.dblClick(screen.getByTestId('text-node-body'));
    await userEvent.type(screen.getByLabelText('文本节点内容'), '水彩风格');
    await userEvent.tab();

    expect((s().nodes.find((item) => item.id === id)!.data as { text: string }).text).toBe('水彩风格');

    s().undo();
    expect((s().nodes.find((item) => item.id === id)!.data as { text: string }).text).toBe('');
  });

  it('连接点在左右两侧中部：左为参考输入、右为输出', () => {
    setup();
    expect(document.querySelector('.react-flow__handle-left')).not.toBeNull();
    expect(document.querySelector('.react-flow__handle-right')).not.toBeNull();
    expect(document.querySelector('.react-flow__handle-top')).toBeNull();
    expect(document.querySelector('.react-flow__handle-bottom')).toBeNull();
  });

  it('节点上直接提供提示词输入框和生成按钮', () => {
    setup();
    expect(screen.getByLabelText('提示词')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 生成' })).toBeInTheDocument();
  });

  it('文本节点不提供参考图槽位（参考图只对出图有意义）', () => {
    setup();
    expect(screen.queryByLabelText('上传参考图')).toBeNull();
  });

  it('在节点上输入提示词并生成后正文更新，提示词保留下来可再次生成', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: '改写后的文案' }));
    vi.stubGlobal('fetch', fetchMock);
    const id = setup();

    await userEvent.type(screen.getByLabelText('提示词'), '改写成更文艺的句子');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => {
      const data = s().nodes.find((item) => item.id === id)!.data as { text: string; prompt: string };
      expect(data.text).toBe('改写后的文案');
      expect(data.prompt).toBe('改写成更文艺的句子');
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.mode).toBe('text');
    expect(body.prompt).toBe('改写成更文艺的句子');
  });

  it('输入提示词不会挤占撤销历史', async () => {
    setup();
    const before = s().past.length;
    await userEvent.type(screen.getByLabelText('提示词'), '水彩');
    expect(s().past.length).toBe(before);
  });

  it('提示词为空且没有连线参考时不能生成', () => {
    setup();
    expect(screen.getByRole('button', { name: 'AI 生成' })).toBeDisabled();
  });

  it('没有提示词但有连线参考时可以生成，参考文本会作为提示词发出', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: '一段结果' }));
    vi.stubGlobal('fetch', fetchMock);

    const reference = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(reference, { text: '水彩风格' } as never);
    const id = s().addTextNode({ x: 300, y: 0 });
    s().onConnect({ source: reference, target: id, sourceHandle: null, targetHandle: null });
    renderTextNode(id);

    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.prompt).toBe('水彩风格');
    expect(body.references.texts).toEqual(['水彩风格']);
  });
});
