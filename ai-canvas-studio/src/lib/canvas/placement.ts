import type { CanvasNode } from './types';

export type Spot = { x: number; y: number };
export type Size = { width: number; height: number };

const GAP = 24;
const MAX_TRIES = 50;

/**
 * 新节点默认放在给的位置；那个位置已经有节点就往下错开。
 * 否则连点两次生成/添加，两个节点会完全叠在一起，看起来像没生效。
 */
export function findFreeSpot(nodes: CanvasNode[], base: Spot, size: Size): Spot {
  const taken = (spot: Spot) =>
    nodes.some((node) => {
      const width = node.width ?? size.width;
      const height = node.height ?? size.height;
      return (
        Math.abs(node.position.x - spot.x) < Math.min(width, size.width) / 2 &&
        Math.abs(node.position.y - spot.y) < Math.min(height, size.height) / 2
      );
    });

  let spot: Spot = { ...base };
  for (let attempt = 0; attempt < MAX_TRIES && taken(spot); attempt += 1) {
    spot = { x: spot.x, y: spot.y + size.height + GAP };
  }
  return spot;
}
