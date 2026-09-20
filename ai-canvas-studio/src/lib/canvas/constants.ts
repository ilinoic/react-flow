export const GRID_SIZE = 16;
export const HISTORY_LIMIT = 100;

export const MIN_NODE_SIZE = {
  text: { width: 120, height: 140 },
  image: { width: 144, height: 160 },
  reference: { width: 144, height: 220 },
} as const;

export const DEFAULT_NODE_SIZE = {
  text: { width: 240, height: 180 },
  image: { width: 240, height: 300 },
  reference: { width: 240, height: 320 },
} as const;

/** 节点类型 → 尺寸表里的键；未知类型按文本节点处理。 */
export function nodeSizeKey(type: string | undefined): keyof typeof DEFAULT_NODE_SIZE {
  if (type === 'image' || type === 'reference') return type;
  return 'text';
}

/** 节点类型 → 新节点 id 的前缀。 */
export function nodeIdPrefix(type: string | undefined): string {
  if (type === 'image') return 'image';
  if (type === 'reference') return 'ref';
  return 'text';
}
