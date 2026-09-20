import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';

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

  it('可以打开与关闭某个节点的 AI 对话框', () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    expect(s().aiPanelNodeId).toBeNull();

    s().openAiPanel(id);
    expect(s().aiPanelNodeId).toBe(id);

    s().closeAiPanel();
    expect(s().aiPanelNodeId).toBeNull();
  });

  it('重置画布会关掉对话框', () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    s().openAiPanel(id);
    s().reset();
    expect(s().aiPanelNodeId).toBeNull();
  });
});
