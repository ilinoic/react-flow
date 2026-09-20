import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import { DEFAULT_NODE_SIZE, HISTORY_LIMIT } from './constants';
import { alignNodes } from './alignment';
import type {
  Alignment,
  CanvasEdge,
  CanvasFile,
  CanvasNode,
  CanvasNodeData,
  ImageNodeData,
  TextNodeData,
} from './types';

type Snapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] };
type UpdateOpts = { history?: boolean };

export type CanvasStore = {
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  aiPanelNodeId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  commitHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
  addTextNode: (position?: { x: number; y: number }) => string;
  addImageNode: (position?: { x: number; y: number }) => string;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>, opts?: UpdateOpts) => void;
  removeNodes: (ids: string[]) => void;
  duplicateNode: (id: string) => string | null;
  disconnectNode: (id: string) => void;
  alignSelection: (alignment: Alignment) => void;
  clearCanvas: () => void;
  onConnect: (connection: Connection) => void;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  setViewport: (viewport: Viewport) => void;
  setName: (name: string) => void;
  openAiPanel: (nodeId: string) => void;
  closeAiPanel: () => void;
  loadCanvas: (file: CanvasFile) => void;
  reset: () => void;
};

let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function emptyAi() {
  return { messages: [], status: 'idle' as const };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useCanvasStore = create<CanvasStore>()((set, get) => {
  const commitHistory = () => {
    const { nodes, edges, past } = get();
    const next = [...past, { nodes: clone(nodes), edges: clone(edges) }];
    set({ past: next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next, future: [] });
  };

  const mutate = (fn: (state: Snapshot) => Partial<Snapshot>, opts: UpdateOpts = {}) => {
    if (opts.history !== false) commitHistory();
    const current = get();
    set(fn({ nodes: current.nodes, edges: current.edges }));
  };

  return {
    name: '未命名画布',
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    aiPanelNodeId: null,
    past: [],
    future: [],

    commitHistory,

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    undo: () => {
      const { past, future, nodes, edges } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        nodes: previous.nodes,
        edges: previous.edges,
        past: past.slice(0, -1),
        future: [{ nodes: clone(nodes), edges: clone(edges) }, ...future].slice(0, HISTORY_LIMIT),
      });
    },

    redo: () => {
      const { past, future, nodes, edges } = get();
      if (future.length === 0) return;
      const [next, ...rest] = future;
      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...past, { nodes: clone(nodes), edges: clone(edges) }].slice(-HISTORY_LIMIT),
        future: rest,
      });
    },

    addTextNode: (position = { x: 0, y: 0 }) => {
      const id = nextId('text');
      const data: TextNodeData = { kind: 'text', text: '', ai: emptyAi() };
      mutate((state) => ({
        nodes: [
          ...state.nodes.map((node) => ({ ...node, selected: false })),
          {
            id,
            type: 'text',
            position,
            width: DEFAULT_NODE_SIZE.text.width,
            height: DEFAULT_NODE_SIZE.text.height,
            selected: true,
            data,
          },
        ],
      }));
      return id;
    },

    addImageNode: (position = { x: 0, y: 0 }) => {
      const id = nextId('image');
      const data: ImageNodeData = { kind: 'image', src: null, alt: '图片节点', ai: emptyAi() };
      mutate((state) => ({
        nodes: [
          ...state.nodes.map((node) => ({ ...node, selected: false })),
          {
            id,
            type: 'image',
            position,
            width: DEFAULT_NODE_SIZE.image.width,
            height: DEFAULT_NODE_SIZE.image.height,
            selected: true,
            data,
          },
        ],
      }));
      return id;
    },

    updateNodeData: (id, patch, opts) => {
      mutate(
        (state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...patch } as CanvasNodeData } : node,
          ),
        }),
        opts,
      );
    },

    removeNodes: (ids) => {
      const target = new Set(ids);
      mutate((state) => ({
        nodes: state.nodes.filter((node) => !target.has(node.id)),
        edges: state.edges.filter((edge) => !target.has(edge.source) && !target.has(edge.target)),
      }));
    },

    duplicateNode: (id) => {
      const node = get().nodes.find((item) => item.id === id);
      if (!node) return null;
      const newId = nextId(node.type === 'image' ? 'image' : 'text');
      mutate((state) => ({
        nodes: [
          ...state.nodes.map((item) => ({ ...item, selected: false })),
          {
            ...clone(node),
            id: newId,
            selected: true,
            position: { x: node.position.x + 32, y: node.position.y + 32 },
          },
        ],
      }));
      return newId;
    },

    disconnectNode: (id) => {
      mutate((state) => ({
        edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      }));
    },

    alignSelection: (alignment) => {
      mutate((state) => ({ nodes: alignNodes(state.nodes, alignment) }));
    },

    clearCanvas: () => {
      mutate(() => ({ nodes: [], edges: [] }));
    },

    onConnect: (connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      mutate((state) => ({
        edges: [
          ...state.edges,
          {
            id: nextId('edge'),
            source: connection.source!,
            target: connection.target!,
            type: 'reference',
            animated: true,
            data: { relation: 'reference' },
          } as CanvasEdge,
        ],
      }));
    },

    onNodesChange: (changes) => {
      set({ nodes: applyNodeChanges(changes, get().nodes) });
    },

    onEdgesChange: (changes) => {
      set({ edges: applyEdgeChanges(changes, get().edges) });
    },

    setViewport: (viewport) => set({ viewport }),

    setName: (name) => set({ name }),

    openAiPanel: (nodeId) => set({ aiPanelNodeId: nodeId }),

    closeAiPanel: () => set({ aiPanelNodeId: null }),

    loadCanvas: (file) => set({
      name: file.name,
      nodes: file.nodes ?? [],
      edges: file.edges ?? [],
      viewport: file.viewport ?? { x: 0, y: 0, zoom: 1 },
      aiPanelNodeId: null,
      past: [],
      future: [],
    }),

    reset: () => set({
      name: '未命名画布',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      aiPanelNodeId: null,
      past: [],
      future: [],
    }),
  };
});

export function selectedNodes(): CanvasNode[] {
  return useCanvasStore.getState().nodes.filter((node) => node.selected);
}
