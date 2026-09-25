import { describe, expect, it } from 'vitest';
import { canvasInteraction } from './interaction';

describe('画布交互模式', () => {
  it('选择工具：能拖节点、能框选，鼠标中键/右键也能平移', () => {
    const mode = canvasInteraction('select');
    expect(mode.nodesDraggable).toBe(true);
    expect(mode.selectionOnDrag).toBe(true);
    expect(mode.nodesConnectable).toBe(true);
    expect(mode.panOnDrag).toEqual([1, 2]);
  });

  it('抓手工具：整块拖就是平移，不拖节点也不框选', () => {
    const mode = canvasInteraction('hand');
    expect(mode.panOnDrag).toBe(true);
    expect(mode.nodesDraggable).toBe(false);
    expect(mode.selectionOnDrag).toBe(false);
  });

  it('待定：什么都移不动 —— 不拖节点、不平移、不框选，连线也拉不动', () => {
    const mode = canvasInteraction('tbd');
    expect(mode.nodesDraggable).toBe(false);
    expect(mode.selectionOnDrag).toBe(false);
    expect(mode.panOnDrag).toBe(false);
    expect(mode.nodesConnectable).toBe(false);
  });
});
