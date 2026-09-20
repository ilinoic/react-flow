import { nodeIdPrefix } from './constants';
import type { CanvasEdge, CanvasNode } from './types';

export type ClipboardPayload = { nodes: CanvasNode[]; edges: CanvasEdge[] };

export type Spot = { x: number; y: number };

const PASTE_OFFSET = 32;

let payload: ClipboardPayload | null = null;

/** 复制选中节点：带上它们之间的连线，跨出去连到未选中节点的线不带走。 */
export function collectSelection(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  ids: string[],
): ClipboardPayload {
  const picked = new Set(ids);
  return {
    nodes: nodes.filter((node) => picked.has(node.id)),
    edges: edges.filter((edge) => picked.has(edge.source) && picked.has(edge.target)),
  };
}

export function setClipboard(next: ClipboardPayload): void {
  payload = next;
}

export function getClipboard(): ClipboardPayload | null {
  return payload;
}

export function clipboardNodeCount(): number {
  return payload?.nodes.length ?? 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 把剪贴板内容变成可以放进画布的新节点：重新编号、连线重连、整组平移。
 * 给 position 就把整组左上角对到那里，否则整体错开一点，不盖住原件。
 */
export function materializeClipboard(
  source: ClipboardPayload,
  options: { idFactory: (prefix: string) => string; position?: Spot },
): ClipboardPayload {
  const baseX = Math.min(...source.nodes.map((node) => node.position.x));
  const baseY = Math.min(...source.nodes.map((node) => node.position.y));
  const shift = options.position
    ? { x: options.position.x - baseX, y: options.position.y - baseY }
    : { x: PASTE_OFFSET, y: PASTE_OFFSET };

  const idMap = new Map<string, string>();
  const nodes = source.nodes.map((node) => {
    const id = options.idFactory(nodeIdPrefix(node.type));
    idMap.set(node.id, id);
    return {
      ...clone(node),
      id,
      selected: true,
      dragging: false,
      position: { x: node.position.x + shift.x, y: node.position.y + shift.y },
    } as CanvasNode;
  });

  const edges = source.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...clone(edge),
      id: options.idFactory('edge'),
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }));

  return { nodes, edges };
}
