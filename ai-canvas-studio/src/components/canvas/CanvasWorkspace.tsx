'use client';

import { useCallback, useRef, useState } from 'react';
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

function Inner() {
  const [tool, setTool] = useState<CanvasTool>('select');
  const [aiPanelNodeId, setAiPanelNodeId] = useState<string | null>(null);
  const [paneMenu, setPaneMenu] = useState<PaneMenu | null>(null);
  const [nodeMenu, setNodeMenu] = useState<NodeMenu | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const name = useCanvasStore((state) => state.name);
  const { screenToFlowPosition } = useReactFlow();

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
    <div ref={containerRef} className="relative h-dvh w-full bg-gray-50">
      <header className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-1.5 text-sm shadow">
        <span className="font-medium text-gray-900">{name}</span>
        <Link href="/settings" className="text-gray-500 hover:text-gray-900">
          AI 设置
        </Link>
        <Link href="/projects" className="text-gray-500 hover:text-gray-900">
          我的画布
        </Link>
      </header>

      <CanvasToolbar tool={tool} onToolChange={setTool} addPosition={addPosition} />
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
              label: '用此图生成',
              disabled: menuNode?.type !== 'image',
              run: () => setAiPanelNodeId(nodeMenu.nodeId),
            },
            {
              label: '断开全部连线',
              run: () => useCanvasStore.getState().disconnectNode(nodeMenu.nodeId),
            },
            {
              label: '复制节点',
              run: () => useCanvasStore.getState().duplicateNode(nodeMenu.nodeId),
            },
          ]}
        />
      )}

      {aiPanelNodeId && (
        <NodeAiPanel nodeId={aiPanelNodeId} onClose={() => setAiPanelNodeId(null)} />
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
