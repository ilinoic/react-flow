import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeAiPanel } from './NodeAiPanel';
import { useCanvasStore } from '@/lib/canvas/store';

const s = () => useCanvasStore.getState();
const svgDataUrl =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

describe('NodeAiPanel', () => {
  beforeEach(() => {
    s().reset();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('展示入边参考来源的文本', () => {
    const ref = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(ref, { text: '水彩风格' });
    const target = s().addImageNode({ x: 300, y: 0 });
    s().onConnect({ source: ref, target, sourceHandle: null, targetHandle: null });

    render(<NodeAiPanel nodeId={target} onClose={() => {}} />);

    expect(screen.getByText('水彩风格')).toBeInTheDocument();
    expect(screen.getByText('参考素材（来自连线）')).toBeInTheDocument();
  });

  it('提示词为空且没有参考文本时给出提示', () => {
    const id = s().addImageNode({ x: 0, y: 0 });
    render(<NodeAiPanel nodeId={id} onClose={() => {}} />);
    expect(screen.getByText(/请输入提示词/)).toBeInTheDocument();
  });

  it('生成成功后写回图片并记录两条对话', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageSrc: svgDataUrl }), { status: 200 })),
    );

    const id = s().addImageNode({ x: 0, y: 0 });
    render(<NodeAiPanel nodeId={id} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('提示词'), '一只柴犬');
    await userEvent.click(screen.getByRole('button', { name: '生成' }));

    await waitFor(() => {
      const data = s().nodes.find((item) => item.id === id)!.data as {
        src: string | null;
        ai: { messages: unknown[] };
      };
      expect(data.src).toContain('data:image/svg+xml');
      expect(data.ai.messages).toHaveLength(2);
    });
  });

  it('文本节点生成后把结果写回正文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '改写后的文案' }), { status: 200 })),
    );

    const id = s().addTextNode({ x: 0, y: 0 });
    render(<NodeAiPanel nodeId={id} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('提示词'), '改写成更文艺的句子');
    await userEvent.click(screen.getByRole('button', { name: '生成' }));

    await waitFor(() => {
      const data = s().nodes.find((item) => item.id === id)!.data as { text: string };
      expect(data.text).toBe('改写后的文案');
    });
  });

  it('失败时显示错误信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '上游 401' }), { status: 502 })),
    );

    const id = s().addImageNode({ x: 0, y: 0 });
    render(<NodeAiPanel nodeId={id} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('提示词'), '猫');
    await userEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('上游 401');
  });

  it('生成请求带上连线参考的文本', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ imageSrc: svgDataUrl }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const ref = s().addTextNode({ x: 0, y: 0 });
    s().updateNodeData(ref, { text: '油画质感' });
    const target = s().addImageNode({ x: 300, y: 0 });
    s().onConnect({ source: ref, target, sourceHandle: null, targetHandle: null });

    render(<NodeAiPanel nodeId={target} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('提示词'), '一只猫');
    await userEvent.click(screen.getByRole('button', { name: '生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.references.texts).toEqual(['油画质感']);
    expect(body.mode).toBe('image');
  });
});
