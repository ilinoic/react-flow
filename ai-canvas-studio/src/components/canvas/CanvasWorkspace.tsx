'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import Link from 'next/link';
import { useCanvasStore } from '@/lib/canvas/store';
import { GRID_SIZE } from '@/lib/canvas/constants';
import { buildCanvasFile, canvasFileName, downloadJson, serializeCanvasFile } from '@/lib/canvas/serialization';
import { importCanvasFile, isCanvasJsonFile } from '@/lib/canvas/importCanvas';
import { downloadImage } from '@/lib/canvas/downloadImage';
import { loadDraft, saveDraft } from '@/lib/canvas/localDraft';
import { createProject, loadProjectGraph, updateProject } from '@/lib/projects/api';
import { CanvasToolbar, type CanvasTool } from './CanvasToolbar';
import { AlignmentBar } from './AlignmentBar';
import { ContextMenu } from './ContextMenu';
import { NodeAiPanel } from './NodeAiPanel';
import { edgeTypes } from './edgeTypes';
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';

const nodeTypes = { text: TextNode, image: ImageNode };

type PaneMenu = { x: number; y: number; flow: { x: number; y: number } };
type NodeMenu = { x: number; y: number; nodeId: string };
type SaveState = 'unsaved' | 'local' | 'cloud' | 'error';

const SAVE_LABEL: Record<SaveState, string> = {
  unsaved: '未保存',
  local: '已保存到本地',
  cloud: '已保存到云端',
  error: '保存失败，请重试或保存到云端',
};

function Inner() {
  const [tool, setTool] = useState<CanvasTool>('select');
  const [paneMenu, setPaneMenu] = useState<PaneMenu | null>(null);
  const [nodeMenu, setNodeMenu] = useState<NodeMenu | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('unsaved');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const name = useCanvasStore((state) => state.name);
  const aiPanelNodeId = useCanvasStore((state) => state.aiPanelNodeId);
  const { screenToFlowPosition } = useReactFlow();
  const { fitView } = useReactFlow();

  // 首次进入：URL 带 project 参数则读云端，否则恢复本地草稿
  useEffect(() => {
    let cancelled = false;
    const queryId = new URLSearchParams(window.location.search).get('project');

    async function restore() {
      if (queryId) {
        try {
          const file = await loadProjectGraph(queryId);
          if (cancelled) return;
          useCanvasStore.getState().loadCanvas(file);
          setProjectId(queryId);
          setSaveState('cloud');
          return;
        } catch {
          if (!cancelled) setSaveState('error');
          return;
        }
      }

      const draft = await loadDraft();
      if (cancelled || !draft) return;
      useCanvasStore.getState().loadCanvas(draft);
      setSaveState('local');
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // 画布变化后 1.5 秒防抖写本地草稿
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useCanvasStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const store = useCanvasStore.getState();
        void saveDraft(
          buildCanvasFile({
            name: store.name,
            nodes: store.nodes,
            edges: store.edges,
            viewport: store.viewport,
          }),
        )
          .then(() => setSaveState((previous) => (previous === 'cloud' ? previous : 'local')))
          // 写不进去就要说出来，否则界面会一直显示「已保存」，刷新才发现丢了。
          .catch(() => setSaveState('error'));
      }, 1500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const saveToCloud = useCallback(async () => {
    const store = useCanvasStore.getState();
    const file = buildCanvasFile({
      name: store.name,
      nodes: store.nodes,
      edges: store.edges,
      viewport: store.viewport,
    });

    setSaving(true);
    try {
      if (projectId) {
        await updateProject(projectId, file, store.name);
      } else {
        const row = await createProject(store.name, file);
        setProjectId(row.id);
        window.history.replaceState(null, '', `/canvas?project=${row.id}`);
      }
      setSaveState('cloud');
    } catch {
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const addPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [screenToFlowPosition]);

  const exportJson = useCallback(() => {
    const store = useCanvasStore.getState();
    const file = buildCanvasFile({
      name: store.name,
      nodes: store.nodes,
      edges: store.edges,
      viewport: store.viewport,
    });
    downloadJson(canvasFileName(store.name), serializeCanvasFile(file));
  }, []);

  const menuNode = nodeMenu ? nodes.find((node) => node.id === nodeMenu.nodeId) : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-dvh w-full bg-gray-50"
      onDragOver={(event) => event.preventDefault()}
      onDrop={async (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (!file || !isCanvasJsonFile(file)) return;
        const result = await importCanvasFile(file);
        if (result.ok) {
          useCanvasStore.getState().loadCanvas(result.file);
          void fitView({ padding: 0.2 });
        }
      }}
    >
      <header className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-1.5 text-sm shadow">
        <input
          aria-label="画布名称"
          value={name}
          onChange={(event) => useCanvasStore.getState().setName(event.target.value)}
          className="w-40 rounded border border-transparent px-1 py-0.5 font-medium text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:outline-none"
        />
        <span className="text-xs text-gray-400">{SAVE_LABEL[saveState]}</span>
        <button
          type="button"
          onClick={saveToCloud}
          disabled={saving}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存到云端'}
        </button>
        <Link href="/settings" className="text-gray-500 hover:text-gray-900">
          AI 设置
        </Link>
        <Link href="/projects" className="text-gray-500 hover:text-gray-900">
          我的画布
        </Link>
      </header>

      <CanvasToolbar
        tool={tool}
        onToolChange={setTool}
        addPosition={addPosition}
        onFitView={() => void fitView({ padding: 0.2 })}
      />
      <AlignmentBar />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={useCanvasStore.getState().onNodesChange}
        onEdgesChange={useCanvasStore.getState().onEdgesChange}
        onConnect={useCanvasStore.getState().onConnect}
        onNodeDragStart={() => useCanvasStore.getState().commitHistory()}
        onMoveEnd={(_, viewport) => useCanvasStore.getState().setViewport(viewport)}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          const mouse = event as unknown as MouseEvent;
          setNodeMenu(null);
          setPaneMenu({
            x: mouse.clientX,
            y: mouse.clientY,
            flow: screenToFlowPosition({ x: mouse.clientX, y: mouse.clientY }),
          });
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          setPaneMenu(null);
          setNodeMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
        }}
        onPaneClick={() => {
          setPaneMenu(null);
          setNodeMenu(null);
        }}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          useCanvasStore.getState().addTextNode(flow);
        }}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        panOnDrag={tool === 'hand' ? true : [1, 2]}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={tool === 'select'}
        fitView
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {paneMenu && (
        <ContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          onClose={() => setPaneMenu(null)}
          items={[
            {
              label: '添加文本节点',
              run: () => useCanvasStore.getState().addTextNode(paneMenu.flow),
            },
            {
              label: '添加图片节点',
              run: () => useCanvasStore.getState().addImageNode(paneMenu.flow),
            },
            {
              label: '全选',
              run: () =>
                useCanvasStore.getState().onNodesChange(
                  useCanvasStore
                    .getState()
                    .nodes.map((node) => ({ id: node.id, type: 'select' as const, selected: true })),
                ),
            },
            { label: '导出画布 JSON', run: exportJson },
          ]}
        />
      )}

      {nodeMenu && (
        <ContextMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          onClose={() => setNodeMenu(null)}
          items={[
            {
              label: '删除节点',
              run: () => useCanvasStore.getState().removeNodes([nodeMenu.nodeId]),
            },
            {
              label: menuNode?.type === 'image' ? '用此图生成' : 'AI 对话框',
              run: () => useCanvasStore.getState().openAiPanel(nodeMenu.nodeId),
            },
            {
              label: '断开全部连线',
              run: () => useCanvasStore.getState().disconnectNode(nodeMenu.nodeId),
            },
            {
              label: '下载图片',
              disabled: menuNode?.type !== 'image' || !(menuNode?.data as { src?: string | null } | undefined)?.src,
              run: () => {
                const src = (menuNode?.data as { src?: string | null } | undefined)?.src;
                if (src) void downloadImage(src);
              },
            },
            {
              label: '复制节点',
              run: () => useCanvasStore.getState().duplicateNode(nodeMenu.nodeId),
            },
          ]}
        />
      )}

      {aiPanelNodeId && (
        <NodeAiPanel
          nodeId={aiPanelNodeId}
          onClose={() => useCanvasStore.getState().closeAiPanel()}
        />
      )}
    </div>
  );
}

export function CanvasWorkspace() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
