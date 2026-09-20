import type { CanvasEdge, CanvasNode } from './types';

export type ReferenceBundle = {
  texts: { nodeId: string; text: string }[];
  images: { nodeId: string; src: string; alt: string }[];
  sources: string[];
};

/**
 * 解析某节点的参考素材。
 * 约定：边是有向的，`source` 提供参考，`target` 消费参考；只取直接入边（一层）。
 */
export function resolveReferences(
  nodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): ReferenceBundle {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const bundle: ReferenceBundle = { texts: [], images: [], sources: [] };

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    if (seen.has(edge.source)) continue;

    const source = byId.get(edge.source);
    if (!source) continue;
    seen.add(edge.source);

    if (source.data.kind === 'text') {
      const value = source.data.text.trim();
      if (!value) continue;
      bundle.texts.push({ nodeId: source.id, text: value });
    } else if (source.data.kind === 'image') {
      const src = source.data.src;
      if (!src) continue;
      bundle.images.push({ nodeId: source.id, src, alt: source.data.alt });
    } else if (source.data.kind === 'reference') {
      const src = source.data.src;
      if (!src) continue;
      bundle.images.push({ nodeId: source.id, src, alt: '参考图' });
    }
    bundle.sources.push(source.id);
  }

  return bundle;
}
