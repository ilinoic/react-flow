import { describe, expect, it } from 'vitest';
import { alignNodes } from './alignment';
import type { CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  selected = true,
): CanvasNode => ({
  id,
  type: 'text',
  position: { x, y },
  width,
  height,
  selected,
  data: { kind: 'text', text: '', prompt: '', ai },
});

const positions = (nodes: CanvasNode[]) =>
  Object.fromEntries(nodes.map((item) => [item.id, item.position]));

describe('alignNodes', () => {
  it('左对齐到选区最左边界', () => {
    const nodes = [node('a', 100, 0, 200, 100), node('b', 400, 200, 100, 50)];
    expect(positions(alignNodes(nodes, 'left'))).toEqual({
      a: { x: 100, y: 0 },
      b: { x: 100, y: 200 },
    });
  });

  it('右对齐到选区最右边界', () => {
    const nodes = [node('a', 100, 0, 200, 100), node('b', 400, 200, 100, 50)];
    expect(positions(alignNodes(nodes, 'right'))).toEqual({
      a: { x: 300, y: 0 },
      b: { x: 400, y: 200 },
    });
  });

  it('水平居中到选区中心', () => {
    const nodes = [node('a', 0, 0, 100, 100), node('b', 300, 0, 100, 100)];
    expect(positions(alignNodes(nodes, 'centerX'))).toEqual({
      a: { x: 150, y: 0 },
      b: { x: 150, y: 0 },
    });
  });

  it('顶对齐与底对齐', () => {
    const nodes = [node('a', 0, 10, 100, 100), node('b', 0, 200, 100, 50)];
    expect(positions(alignNodes(nodes, 'top'))).toEqual({
      a: { x: 0, y: 10 },
      b: { x: 0, y: 10 },
    });
    expect(positions(alignNodes(nodes, 'bottom'))).toEqual({
      a: { x: 0, y: 150 },
      b: { x: 0, y: 200 },
    });
  });

  it('垂直居中到选区中心', () => {
    const nodes = [node('a', 0, 0, 100, 100), node('b', 0, 300, 100, 100)];
    expect(positions(alignNodes(nodes, 'centerY'))).toEqual({
      a: { x: 0, y: 150 },
      b: { x: 0, y: 150 },
    });
  });

  it('未选中节点不受影响', () => {
    const nodes = [node('a', 100, 0, 200, 100), node('b', 400, 200, 100, 50, false)];
    expect(positions(alignNodes(nodes, 'left')).b).toEqual({ x: 400, y: 200 });
  });

  it('选中数量少于 2 时原样返回', () => {
    const nodes = [node('a', 100, 0, 200, 100)];
    expect(positions(alignNodes(nodes, 'left'))).toEqual({ a: { x: 100, y: 0 } });
  });
});
