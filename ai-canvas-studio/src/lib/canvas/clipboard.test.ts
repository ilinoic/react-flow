import { describe, expect, it } from 'vitest';
import { collectSelection, materializeClipboard } from './clipboard';
import type { CanvasEdge, CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };

function node(id: string, type: CanvasNode['type'], x: number, y: number): CanvasNode {
  if (type === 'text') {
    return {
      id,
      type,
      position: { x, y },
      width: 240,
      height: 180,
      data: { kind: 'text', text: id, prompt: '', ai },
    };
  }
  if (type === 'reference') {
    return {
      id,
      type,
      position: { x, y },
      width: 240,
      height: 320,
      data: { kind: 'reference', src: null, prompt: '', ai },
    };
  }
  return {
    id,
    type,
    position: { x, y },
    width: 240,
    height: 300,
    data: { kind: 'image', src: null, alt: id, prompt: '', ai },
  };
}

const edge = (id: string, source: string, target: string): CanvasEdge => ({
  id,
  source,
  target,
  type: 'reference',
  data: { relation: 'reference' },
});

function idFactory() {
  let count = 0;
  return (prefix: string) => `${prefix}_new${(count += 1)}`;
}

describe('复制粘贴', () => {
  it('只带上选中的节点，以及它们之间的连线', () => {
    const nodes = [node('a', 'text', 0, 0), node('b', 'image', 300, 0), node('c', 'image', 600, 0)];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];

    const payload = collectSelection(nodes, edges, ['a', 'b']);

    expect(payload.nodes.map((item) => item.id)).toEqual(['a', 'b']);
    // b→c 的另一头没被选中，不带走
    expect(payload.edges.map((item) => item.id)).toEqual(['e1']);
  });

  it('粘贴出来的是新节点，连线跟着重连到新节点上', () => {
    const payload = collectSelection(
      [node('a', 'text', 0, 0), node('b', 'image', 300, 0)],
      [edge('e1', 'a', 'b')],
      ['a', 'b'],
    );

    const pasted = materializeClipboard(payload, { idFactory: idFactory() });

    expect(pasted.nodes.map((item) => item.id)).toEqual(['text_new1', 'image_new2']);
    expect(pasted.nodes.every((item) => item.selected)).toBe(true);
    expect(pasted.edges).toHaveLength(1);
    expect(pasted.edges[0].source).toBe('text_new1');
    expect(pasted.edges[0].target).toBe('image_new2');
  });

  it('不给位置时整体错开一点，不盖住原件', () => {
    const payload = collectSelection([node('a', 'text', 100, 50)], [], ['a']);
    const pasted = materializeClipboard(payload, { idFactory: idFactory() });
    expect(pasted.nodes[0].position.x).toBeGreaterThan(100);
    expect(pasted.nodes[0].position.y).toBeGreaterThan(50);
  });

  it('给了位置就把整组左上角对到那个位置', () => {
    const payload = collectSelection([node('a', 'text', 100, 50), node('b', 'image', 500, 400)], [], ['a', 'b']);
    const pasted = materializeClipboard(payload, { idFactory: idFactory(), position: { x: 0, y: 0 } });
    expect(pasted.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(pasted.nodes[1].position).toEqual({ x: 400, y: 350 });
  });

  it('参考图片节点粘贴后还是参考图片节点', () => {
    const payload = collectSelection([node('r', 'reference', 0, 0)], [], ['r']);
    const pasted = materializeClipboard(payload, { idFactory: idFactory() });
    expect(pasted.nodes[0].type).toBe('reference');
    expect(pasted.nodes[0].id.startsWith('ref_')).toBe(true);
  });
});
