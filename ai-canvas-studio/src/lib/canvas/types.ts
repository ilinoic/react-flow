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

export type TextNodeData = { kind: 'text'; text: string; ai: AiNodeState };
export type ImageNodeData = {
  kind: 'image';
  src: string | null;
  storagePath?: string;
  alt: string;
  ai: AiNodeState;
};
export type CanvasNodeData = TextNodeData | ImageNodeData;

export type CanvasNode = Node<CanvasNodeData & Record<string, unknown>, 'text' | 'image'>;
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
