import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ImageNode } from './ImageNode';
import { useCanvasStore } from '@/lib/canvas/store';
import { PROVIDER_PRESETS, saveAiSettings } from '@/lib/ai/settings';
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

  it('点「收起」能关掉 AI 对话框，只留一个入口，点入口能再打开', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '关闭 AI 对话框' }));
    expect(screen.queryByLabelText('提示词')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '打开 AI 对话框' }));
    expect(screen.getByLabelText('提示词')).toBeInTheDocument();
  });

  it('节点已经有图时，直接点生成会拿当前这张图当底图', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);
    const id = s().addImageNode({ x: 0, y: 0 });
    s().updateNodeData(id, { src: svgDataUrl } as never);
    renderImageNode(id);

    await userEvent.type(screen.getByLabelText('提示词'), '把背景换成夜晚');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.references.images[0].dataUrl).toBe(svgDataUrl);
  });

  it('关掉「基于当前图修改」后从零生成，不带底图', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);
    const id = s().addImageNode({ x: 0, y: 0 });
    s().updateNodeData(id, { src: svgDataUrl } as never);
    renderImageNode(id);

    await userEvent.click(screen.getByLabelText('基于当前图修改')); // 取消勾选
    await userEvent.type(screen.getByLabelText('提示词'), '重新画一只完全不同的猫');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.references.images).toEqual([]);
  });

  it('节点有图之后才出现「基于当前图修改」，并且默认勾上', async () => {
    const id = setup();
    expect(screen.queryByLabelText('基于当前图修改')).toBeNull();

    s().updateNodeData(id, { src: svgDataUrl } as never);

    expect(await screen.findByLabelText('基于当前图修改')).toBeChecked();
  });

  it('反复生成不会把历史图片堆在草稿里', async () => {
    // 每次都给一个新的 Response：同一个 Response 的 body 只能读一次。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ imageSrc: svgDataUrl })));
    const id = setup();

    await userEvent.type(screen.getByLabelText('提示词'), '一只柴犬');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));
    await waitFor(() => expect((s().nodes.find((n) => n.id === id)!.data as { src: string | null }).src).toBe(svgDataUrl));

    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));
    await waitFor(() => {
      const messages = (s().nodes.find((n) => n.id === id)!.data as {
        ai: { messages: { imageSrc?: string }[] };
      }).ai.messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].imageSrc).toBeUndefined();
      expect(messages[1].imageSrc).toBeDefined();
    });
  });

  it('改图时参考信息超过接口上限会明说会截断', async () => {
    saveAiSettings({ provider: 'qwen', apiKey: 'sk-test', ...PROVIDER_PRESETS.qwen });
    const reference = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(reference, { text: '剧本'.repeat(1000) } as never);
    const id = s().addImageNode({ x: 300, y: 0 });
    s().updateNodeData(id, { src: svgDataUrl } as never);
    s().onConnect({ source: reference, target: id, sourceHandle: null, targetHandle: null });
    renderImageNode(id);

    expect(screen.getByText(/参考信息只带前/)).toBeInTheDocument();
  });

  it('图改图模型是多模态那一类时不提示截断（那条接口没有 1800 字上限）', async () => {
    saveAiSettings({
      provider: 'qwen',
      apiKey: 'sk-test',
      ...PROVIDER_PRESETS.qwen,
      imageEditModel: 'qwen-image-edit-plus',
    });
    const reference = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(reference, { text: '剧本'.repeat(1000) } as never);
    const id = s().addImageNode({ x: 300, y: 0 });
    s().updateNodeData(id, { src: svgDataUrl } as never);
    s().onConnect({ source: reference, target: id, sourceHandle: null, targetHandle: null });
    renderImageNode(id);

    expect(screen.queryByText(/参考信息只带前/)).toBeNull();
  });
});
