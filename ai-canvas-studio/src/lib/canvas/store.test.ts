import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';
import { MIN_NODE_SIZE } from './constants';

const s = () => useCanvasStore.getState();

describe('画布状态仓库', () => {
  beforeEach(() => s().reset());

  it('新增文本节点后可以撤销与重做', () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    expect(s().nodes).toHaveLength(1);
    expect(s().nodes[0].id).toBe(id);
    s().undo();
    expect(s().nodes).toHaveLength(0);
    s().redo();
    expect(s().nodes).toHaveLength(1);
  });

  it('删除节点会同时删除相关连线', () => {
    const a = s().addTextNode({ x: 0, y: 0 });
    const b = s().addImageNode({ x: 300, y: 0 });
    s().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    expect(s().edges).toHaveLength(1);
    s().removeNodes([a]);
    expect(s().nodes).toHaveLength(1);
    expect(s().edges).toHaveLength(0);
  });

  it('清空画布可撤销', () => {
    s().addTextNode({ x: 0, y: 0 });
    s().addTextNode({ x: 10, y: 10 });
    s().clearCanvas();
    expect(s().nodes).toHaveLength(0);
    s().undo();
    expect(s().nodes).toHaveLength(2);
  });

  it('可以用 history:false 更新数据而不入栈', () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    const before = s().past.length;
    s().updateNodeData(id, { text: '第一次' } as never);
    s().updateNodeData(id, { text: '第二次' } as never, { history: false });
    expect(s().past.length).toBe(before + 1);
    s().undo();
    const node = s().nodes.find((n) => n.id === id)!;
    expect((node.data as { text?: string }).text).toBe('');
  });

  it('历史栈不超过上限', () => {
    for (let i = 0; i < 130; i += 1) s().addTextNode({ x: i, y: 0 });
    expect(s().past.length).toBeLessThanOrEqual(100);
  });

  it('新增节点自带空提示词，等待在节点上直接填写', () => {
    const text = s().addTextNode({ x: 0, y: 0 });
    const image = s().addImageNode({ x: 300, y: 0 });

    expect((s().nodes.find((node) => node.id === text)!.data as { prompt: string }).prompt).toBe('');
    expect((s().nodes.find((node) => node.id === image)!.data as { prompt: string }).prompt).toBe('');
  });

  it('读取旧画布时给缺少提示词的节点补上空提示词', () => {
    s().loadCanvas({
      version: 1,
      name: '旧画布',
      exportedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'text_old',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { kind: 'text', text: '旧内容', ai: { messages: [], status: 'idle' } },
        },
      ],
      edges: [],
    } as never);

    expect((s().nodes[0].data as { prompt?: string }).prompt).toBe('');
  });

  it('读取旧画布时把过小的节点抬到最小尺寸，保证提示词输入框看得见', () => {
    s().loadCanvas({
      version: 1,
      name: '旧画布',
      exportedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'text_tiny',
          type: 'text',
          position: { x: 0, y: 0 },
          width: 100,
          height: 40,
          data: { kind: 'text', text: '', prompt: '', ai: { messages: [], status: 'idle' } },
        },
      ],
      edges: [],
    } as never);

    expect(s().nodes[0].width).toBeGreaterThanOrEqual(MIN_NODE_SIZE.text.width);
    expect(s().nodes[0].height).toBeGreaterThanOrEqual(MIN_NODE_SIZE.text.height);
  });

  it('新增参考图片节点：类型是 reference，参考图为空', () => {
    const id = s().addReferenceNode({ x: 0, y: 0 });
    const node = s().nodes.find((item) => item.id === id)!;

    expect(node.type).toBe('reference');
    expect(node.data.kind).toBe('reference');
    expect((node.data as { src: string | null }).src).toBeNull();
    expect((node.data as { prompt: string }).prompt).toBe('');
  });
});
