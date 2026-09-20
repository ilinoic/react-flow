export const GRID_SIZE = 16;
export const HISTORY_LIMIT = 100;

export const MIN_NODE_SIZE = {
  text: { width: 120, height: 60 },
  image: { width: 120, height: 120 },
} as const;

export const DEFAULT_NODE_SIZE = {
  text: { width: 240, height: 120 },
  image: { width: 240, height: 240 },
} as const;
