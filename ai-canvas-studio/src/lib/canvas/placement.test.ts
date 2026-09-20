import { describe, expect, it } from 'vitest';
import { findFreeSpot } from './placement';
import type { CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };

function imageNode(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    type: 'image',
    position: { x, y },
    width: 240,
    height: 300,
    data: { kind: 'image', src: null, alt: id, prompt: '', ai },
  };
}

const size = { width: 240, height: 300 };

describe('findFreeSpot（新节点摆放）', () => {
  it('空画布时就用给的位置', () => {
    expect(findFreeSpot([], { x: 100, y: 200 }, size)).toEqual({ x: 100, y: 200 });
  });

  it('那个位置已经有节点时往下错开', () => {
    const spot = findFreeSpot([imageNode('a', 100, 200)], { x: 100, y: 200 }, size);
    expect(spot.x).toBe(100);
    expect(spot.y).toBeGreaterThan(200);
  });

  it('连放三个也不会叠在一起', () => {
    const nodes: CanvasNode[] = [];
    const seen: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const spot = findFreeSpot(nodes, { x: 100, y: 200 }, size);
      seen.push(`${spot.x},${spot.y}`);
      nodes.push(imageNode(`n${index}`, spot.x, spot.y));
    }
    expect(new Set(seen).size).toBe(3);
  });
});
