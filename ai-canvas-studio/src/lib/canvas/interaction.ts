/** 工具栏上的三种模式。 */
export type CanvasTool = 'tbd' | 'select' | 'hand';

export type CanvasInteraction = {
  /** true = 按住就平移；数组 = 只有这些鼠标键能平移；false = 怎么拖都不动。 */
  panOnDrag: boolean | number[];
  selectionOnDrag: boolean;
  nodesDraggable: boolean;
  nodesConnectable: boolean;
};

/**
 * 每种模式下画布允许什么操作。
 * 「待定」是留给还没定用途的那一格：现在的语义是**什么都移不动**，
 * 看一眼、点一点没问题，但拖节点、平移、框选、拉连线全都不响应。
 */
export function canvasInteraction(tool: CanvasTool): CanvasInteraction {
  if (tool === 'hand') {
    return { panOnDrag: true, selectionOnDrag: false, nodesDraggable: false, nodesConnectable: true };
  }
  if (tool === 'tbd') {
    return { panOnDrag: false, selectionOnDrag: false, nodesDraggable: false, nodesConnectable: false };
  }
  return { panOnDrag: [1, 2], selectionOnDrag: true, nodesDraggable: true, nodesConnectable: true };
}
