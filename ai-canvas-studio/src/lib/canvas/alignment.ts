import { DEFAULT_NODE_SIZE } from './constants';
import type { Alignment, CanvasNode } from './types';

function sizeOf(node: CanvasNode) {
  const fallback = DEFAULT_NODE_SIZE[node.type === 'image' ? 'image' : 'text'];
  return {
    width: node.width ?? node.measured?.width ?? fallback.width,
    height: node.height ?? node.measured?.height ?? fallback.height,
  };
}

/** 只移动被选中的节点；基准是选中节点的包围盒。 */
export function alignNodes(nodes: CanvasNode[], alignment: Alignment): CanvasNode[] {
  const boxes = nodes
    .filter((node) => node.selected)
    .map((node) => ({ node, ...sizeOf(node) }));

  if (boxes.length < 2) return nodes;

  const minX = Math.min(...boxes.map((box) => box.node.position.x));
  const minY = Math.min(...boxes.map((box) => box.node.position.y));
  const maxRight = Math.max(...boxes.map((box) => box.node.position.x + box.width));
  const maxBottom = Math.max(...boxes.map((box) => box.node.position.y + box.height));
  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;

  const moved = new Map<string, { x: number; y: number }>();
  for (const box of boxes) {
    const { x, y } = box.node.position;
    if (alignment === 'left') moved.set(box.node.id, { x: minX, y });
    else if (alignment === 'right') moved.set(box.node.id, { x: maxRight - box.width, y });
    else if (alignment === 'centerX') moved.set(box.node.id, { x: centerX - box.width / 2, y });
    else if (alignment === 'top') moved.set(box.node.id, { x, y: minY });
    else if (alignment === 'bottom') moved.set(box.node.id, { x, y: maxBottom - box.height });
    else moved.set(box.node.id, { x, y: centerY - box.height / 2 });
  }

  return nodes.map((node) =>
    moved.has(node.id) ? { ...node, position: moved.get(node.id)! } : node,
  );
}
