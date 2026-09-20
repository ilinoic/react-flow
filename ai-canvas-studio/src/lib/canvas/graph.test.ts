import { describe, expect, it } from 'vitest';
import { resolveReferences } from './graph';
import type { CanvasEdge, CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };

const text = (id: string, value: string): CanvasNode => ({
  id,
  type: 'text',
  position: { x: 0, y: 0 },
  data: { kind: 'text', text: value, ai },
});

const image = (id: string, src: string | null): CanvasNode => ({
  id,
  type: 'image',
  position: { x: 0, y: 0 },
  data: { kind: 'image', src, alt: id, ai },
});

const edge = (source: string, target: string): CanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  type: 'reference',
  data: { relation: 'reference' },
});

describe('resolveReferences', () => {
  it('收集入边的文本与图片作为参考', () => {
    const nodes = [text('t1', '水彩风格'), image('i1', 'data:image/png;base64,AAA'), text('n', '')];
    const bundle = resolveReferences('n', nodes, [edge('t1', 'n'), edge('i1', 'n')]);
    expect(bundle.texts.map((item) => item.text)).toEqual(['水彩风格']);
    expect(bundle.images.map((item) => item.src)).toEqual(['data:image/png;base64,AAA']);
    expect(bundle.sources).toEqual(['t1', 'i1']);
  });

  it('出边方向不算参考', () => {
    const nodes = [text('t1', 'A'), image('i1', null)];
    const bundle = resolveReferences('t1', nodes, [edge('t1', 'i1')]);
    expect(bundle.texts).toHaveLength(0);
    expect(bundle.images).toHaveLength(0);
  });

  it('空文本与未上传图片不计入参考', () => {
    const nodes = [text('t1', '   '), image('i1', null)];
    const bundle = resolveReferences('n', nodes, [edge('t1', 'n'), edge('i1', 'n')]);
    expect(bundle.texts).toHaveLength(0);
    expect(bundle.images).toHaveLength(0);
  });

  it('同一来源重复连线只算一次', () => {
    const nodes = [text('t1', 'A')];
    const bundle = resolveReferences('n', nodes, [edge('t1', 'n'), { ...edge('t1', 'n'), id: 'dup' }]);
    expect(bundle.texts).toHaveLength(1);
  });

  it('入边指向不存在的节点时安全跳过', () => {
    expect(resolveReferences('n', [], [edge('ghost', 'n')]).sources).toEqual([]);
  });

  it('按连线顺序保留多个文本参考', () => {
    const nodes = [text('a', '第一条'), text('b', '第二条')];
    const bundle = resolveReferences('n', nodes, [edge('a', 'n'), edge('b', 'n')]);
    expect(bundle.texts.map((item) => item.text)).toEqual(['第一条', '第二条']);
  });
});
