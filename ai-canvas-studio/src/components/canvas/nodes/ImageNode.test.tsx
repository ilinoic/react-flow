import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ImageNode } from './ImageNode';
import { useCanvasStore } from '@/lib/canvas/store';
import type { CanvasNode } from '@/lib/canvas/types';

const s = () => useCanvasStore.getState();
const svgDataUrl =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

function renderImageNode(id: string) {
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
}

function setup() {
  const id = s().addImageNode({ x: 0, y: 0 });
  renderImageNode(id);
  return id;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('ImageNode', () => {
  beforeEach(() => {
    s().reset();
    localStorage.clear();
    vi.restoreAllMocks();
  });

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

  it('节点上直接提供提示词输入框和生成按钮', () => {
    setup();
    expect(screen.getByLabelText('提示词')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 生成' })).toBeInTheDocument();
  });

  it('在节点上输入提示词并生成后图片写回该节点', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);
    const id = setup();

    await userEvent.type(screen.getByLabelText('提示词'), '一只柴犬');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => {
      const data = s().nodes.find((item) => item.id === id)!.data as {
        src: string | null;
        prompt: string;
        ai: { messages: unknown[] };
      };
      expect(data.src).toContain('data:image/svg+xml');
      expect(data.prompt).toBe('一只柴犬');
      expect(data.ai.messages).toHaveLength(2);
    });
  });

  it('生成过程中按钮禁用并显示生成中', async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      ),
    );
    setup();

    await userEvent.type(screen.getByLabelText('提示词'), '一只猫');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    expect(await screen.findByRole('button', { name: '生成中…' })).toBeDisabled();
    finish(jsonResponse({ imageSrc: svgDataUrl }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 生成' })).toBeEnabled());
  });

  it('失败时在节点上显示上游错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: '上游 401' }, 502)));
    setup();

    await userEvent.type(screen.getByLabelText('提示词'), '猫');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('上游 401');
  });

  it('模拟模式下提示出的是占位图', () => {
    setup();
    expect(screen.getByText(/模拟模式/)).toBeInTheDocument();
  });

  it('请求带上连线参考，并在节点上标出参考数量', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);

    const reference = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(reference, { text: '油画质感' } as never);
    const id = s().addImageNode({ x: 300, y: 0 });
    s().onConnect({ source: reference, target: id, sourceHandle: null, targetHandle: null });
    renderImageNode(id);

    expect(screen.getByText('参考：1 个文本')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('提示词'), '一只猫');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.references.texts).toEqual(['油画质感']);
    expect(body.mode).toBe('image');
  });

  it('节点上放参考图后，生成请求把它一起发出去', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);
    const id = setup();

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'ref.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('上传参考图'), file);

    await waitFor(() => {
      const data = s().nodes.find((item) => item.id === id)!.data as { referenceSrc?: string | null };
      expect(data.referenceSrc).toContain('data:image/png');
    });

    await userEvent.type(screen.getByLabelText('提示词'), '把背景换成蓝色');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.references.images[0].dataUrl).toContain('data:image/png');
    expect(body.prompt).toBe('把背景换成蓝色');
  });

  it('生成之后节点上的参考图仍然在，不被结果覆盖', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl })));
    const id = setup();

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'ref.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('上传参考图'), file);
    await userEvent.type(screen.getByLabelText('提示词'), '换成蓝色背景');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => {
      const data = s().nodes.find((item) => item.id === id)!.data as {
        src: string | null;
        referenceSrc?: string | null;
      };
      expect(data.src).toContain('data:image/svg+xml');
      expect(data.referenceSrc).toContain('data:image/png');
    });
  });

  it('可以移除已经放好的参考图', async () => {
    setup();
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'ref.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('上传参考图'), file);

    await userEvent.click(await screen.findByRole('button', { name: '移除参考图' }));

    expect(screen.getByLabelText('上传参考图')).toBeInTheDocument();
  });

  it('中文输入法组词期间不把半成品写进画布，组词结束才落库', async () => {
    const id = setup();
    const input = screen.getByLabelText('提示词');

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'shui' } });
    expect((s().nodes.find((item) => item.id === id)!.data as { prompt: string }).prompt).toBe('');

    fireEvent.change(input, { target: { value: '水' } });
    expect((s().nodes.find((item) => item.id === id)!.data as { prompt: string }).prompt).toBe('');

    fireEvent.compositionEnd(input, { target: { value: '水彩' } });
    expect((s().nodes.find((item) => item.id === id)!.data as { prompt: string }).prompt).toBe('水彩');
  });
});
