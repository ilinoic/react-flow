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

  it('还没放图时显示上传入口，并说明生成会写在本节点上', () => {
    setup();
    expect(screen.getByLabelText('上传参考图')).toBeInTheDocument();
    expect(screen.getByText(/生成的结果就写在这个节点上/)).toBeInTheDocument();
  });

  it('生成结果直接写回本节点，不再新建节点', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl })));
    const id = setup();
    await addReferenceImage();
    await userEvent.type(screen.getByLabelText('提示词'), '换成蓝色背景');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => {
      const data = s().nodes.find((node) => node.id === id)!.data as { src: string | null };
      expect(data.src).toContain('data:image/svg+xml');
    });

    expect(s().nodes).toHaveLength(1);
  });

  it('把节点自己的参考图作为参考素材发出去', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imageSrc: svgDataUrl }));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    await addReferenceImage();

    await userEvent.type(screen.getByLabelText('提示词'), '换成蓝色背景');
    await userEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.mode).toBe('image');
    expect(body.references.images[0].dataUrl).toContain('data:image/png');
  });
});
