import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ReferenceNode } from './ReferenceNode';
import { useCanvasStore } from '@/lib/canvas/store';
import type { CanvasNode } from '@/lib/canvas/types';

const s = () => useCanvasStore.getState();
const svgDataUrl =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

function renderReferenceNode(id: string) {
  const node = s().nodes.find((item) => item.id === id)!;
  const props = {
    id,
    data: node.data,
    selected: false,
    type: 'reference',
    position: node.position,
    width: 240,
    height: 300,
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
      <ReferenceNode {...props} />
    </ReactFlowProvider>,
  );
}

function setup() {
  const id = s().addReferenceNode({ x: 0, y: 0 });
  renderReferenceNode(id);
  return id;
}

async function addReferenceImage() {
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'ref.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('上传参考图'), file);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('ReferenceNode（参考图片节点）', () => {
  beforeEach(() => {
    s().reset();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('还没放图时显示上传入口，并提示这张图只作参考', () => {
    setup();
    expect(screen.getByLabelText('上传参考图')).toBeInTheDocument();
    expect(screen.getByText(/只作参考/)).toBeInTheDocument();
  });

  it('生成结果落到旁边的新节点，参考图留在原节点', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl })));
    const id = setup();
    await addReferenceImage();
    await userEvent.type(screen.getByLabelText('提示词'), '换成蓝色背景');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成到新节点' }));

    await waitFor(() => expect(s().nodes).toHaveLength(2));

    const source = s().nodes.find((node) => node.id === id)!;
    expect((source.data as { src: string | null }).src).toContain('data:image/png');

    const created = s().nodes.find((node) => node.id !== id)!;
    expect(created.type).toBe('image');
    expect((created.data as { src: string | null }).src).toContain('data:image/svg+xml');
  });

  it('把节点自己的参考图作为参考素材发出去', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    await addReferenceImage();

    await userEvent.type(screen.getByLabelText('提示词'), '换成蓝色背景');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成到新节点' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.mode).toBe('image');
    expect(body.references.images[0].dataUrl).toContain('data:image/png');
  });
});
