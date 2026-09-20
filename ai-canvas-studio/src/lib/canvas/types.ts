import type { Edge, Node, Viewport, XYPosition } from '@xyflow/react';

export type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageSrc?: string;
  createdAt: string;
};

export type AiNodeState = {
  messages: AiMessage[];
  status: 'idle' | 'running' | 'error';
  error?: string;
};

export type TextNodeData = {
  kind: 'text';
  text: string;
  prompt: string;
  /** 节点自带的参考图，不参与生成结果的写回。 */
  referenceSrc?: string | null;
  /** 锁住的节点拖不动，避免排好版之后手滑挪走。 */
  locked?: boolean;
  /** 节点底部的 AI 对话框是否展开。 */
  aiOpen?: boolean;
  ai: AiNodeState;
};
export type ImageNodeData = {
  kind: 'image';
  src: string | null;
  storagePath?: string;
  alt: string;
  prompt: string;
  referenceSrc?: string | null;
  locked?: boolean;
  aiOpen?: boolean;
  ai: AiNodeState;
};
/** 参考图片节点：只放参考素材，生成的结果落到旁边新节点。 */
export type ReferenceNodeData = {
  kind: 'reference';
  src: string | null;
  prompt: string;
  locked?: boolean;
  aiOpen?: boolean;
  ai: AiNodeState;
};
export type CanvasNodeData = TextNodeData | ImageNodeData | ReferenceNodeData;

export type CanvasNodeType = 'text' | 'image' | 'reference';
export type CanvasNode = Node<CanvasNodeData & Record<string, unknown>, CanvasNodeType>;
export type CanvasEdge = Edge<{ relation: 'reference' }, 'reference'>;

export type Alignment = 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY';

export type CanvasFile = {
  version: 1;
  name: string;
  exportedAt: string;
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export type Position = XYPosition;
