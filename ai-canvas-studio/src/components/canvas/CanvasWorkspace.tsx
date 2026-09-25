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
import { useCanvasStore } from '@/lib/canvas/store';
import { GRID_SIZE } from '@/lib/canvas/constants';
import { buildCanvasFile, canvasFileName, downloadJson, serializeCanvasFile } from '@/lib/canvas/serialization';
import { importCanvasFile, isCanvasJsonFile } from '@/lib/canvas/importCanvas';
import { downloadImage } from '@/lib/canvas/downloadImage';
import { copyImageToClipboard } from '@/lib/canvas/clipboardImage';
import { clipboardNodeCount } from '@/lib/canvas/clipboard';
import { clearDraft, draftKey, loadDraft, saveDraft } from '@/lib/canvas/localDraft';
import { isTextInputTarget } from '@/lib/canvas/contextTarget';
import { createProject, loadProjectGraph, updateProject } from '@/lib/projects/api';
import {
  EMPTY_TABS,
  activateTab,
  bindProject,
  closeTab,
  loadCanvases,
  loadTabs,
  markLegacyMigrationDone,
  newCanvas,
  needsLocalEntry,
  needsLegacyMigration,
  openTab,
  pruneCanvases,
  renameCanvas,
  saveCanvases,
  saveTabs,
  upsertCanvas,
  type LocalCanvas,
  type OpenTabs,
} from '@/lib/canvas/localCanvases';
import { CanvasToolbar, type CanvasTool } from './CanvasToolbar';
import { AlignmentBar } from './AlignmentBar';
import { ContextMenu } from './ContextMenu';
import { CanvasTabs } from './CanvasTabs';
import { CanvasSettingsMenu } from './CanvasSettingsMenu';
import { edgeTypes } from './edgeTypes';
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';
import { ReferenceNode } from './nodes/ReferenceNode';

const nodeTypes = { text: TextNode, image: ImageNode, reference: ReferenceNode };

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
  const [saveState, setSaveState] = useState<SaveState>('unsaved');
  const [saving, setSaving] = useState(false);
  const [canvases, setCanvases] = useState<LocalCanvas[]>([]);
  const [tabs, setTabs] = useState<OpenTabs>(EMPTY_TABS);
  const containerRef = useRef<HTMLDivElement>(null);
  // 草稿加载完之前不许自动保存，否则会拿刚挂载的空画布把草稿覆盖掉。
  const readyRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const canvasesRef = useRef<LocalCanvas[]>([]);
  const tabsRef = useRef<OpenTabs>(EMPTY_TABS);

  useEffect(() => {
    canvasesRef.current = canvases;
  }, [canvases]);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const name = useCanvasStore((state) => state.name);
  const { screenToFlowPosition } = useReactFlow();
  const { fitView } = useReactFlow();

  /** 把当前画布写进它自己那份草稿。切标签、新建之前都要先把这张存下来。 */
  const persistActive = useCallback(async () => {
    const canvasId = activeIdRef.current;
    if (!canvasId) return;
    const store = useCanvasStore.getState();
    try {
      await saveDraft(
        buildCanvasFile({
          name: store.name,
          nodes: store.nodes,
          edges: store.edges,
          viewport: store.viewport,
        }),
        draftKey(canvasId),
      );
    } catch {
      setSaveState('error');
    }
  }, []);

  /** 把某张画布的草稿读进画布；没有草稿就是一张空白画布。 */
  const loadCanvasById = useCallback(async (id: string) => {
    activeIdRef.current = id;
    const draft = await loadDraft(draftKey(id));
    if (draft) useCanvasStore.getState().loadCanvas(draft);
    else useCanvasStore.getState().reset();
    setSaveState(draft ? 'local' : 'unsaved');
    return Boolean(draft);
  }, []);

  const openNewCanvas = useCallback(async () => {
    await persistActive();
    const canvas = newCanvas();
    const { kept, dropped } = pruneCanvases(upsertCanvas(canvasesRef.current, canvas), tabsRef.current.open);
    dropped.forEach((id) => clearDraft(draftKey(id)));
    saveCanvases(kept);
    setCanvases(kept);
    const nextTabs = openTab(tabsRef.current, canvas.id);
    saveTabs(nextTabs);
    setTabs(nextTabs);
    activeIdRef.current = canvas.id;
    useCanvasStore.getState().reset();
    setSaveState('unsaved');
  }, [persistActive]);

  const switchToCanvas = useCallback(
    async (id: string) => {
      if (activeIdRef.current === id) return;
      await persistActive();
      const nextTabs = openTab(tabsRef.current, id);
      saveTabs(nextTabs);
      setTabs(nextTabs);
      await loadCanvasById(id);
      void fitView({ padding: 0.2 });
    },
    [fitView, loadCanvasById, persistActive],
  );

  const onCloseTab = useCallback(
    async (id: string) => {
      const wasActive = activeIdRef.current === id;
      await persistActive();
      const nextTabs = closeTab(tabsRef.current, id);
      saveTabs(nextTabs);
      setTabs(nextTabs);
      if (!wasActive) return;
      if (nextTabs.activeId) {
        await loadCanvasById(nextTabs.activeId);
        return;
      }
      // 标签全关掉：留一张还没归属的空白画布，画布本身还在本地列表里，随时能再打开
      activeIdRef.current = null;
      useCanvasStore.getState().reset();
      setSaveState('unsaved');
    },
    [loadCanvasById, persistActive],
  );

  const deleteLocalCanvas = useCallback(
    async (id: string) => {
      clearDraft(draftKey(id));
      const list = canvasesRef.current.filter((canvas) => canvas.id !== id);
      saveCanvases(list);
      setCanvases(list);
      const nextTabs = closeTab(tabsRef.current, id);
      saveTabs(nextTabs);
      setTabs(nextTabs);
      if (activeIdRef.current !== id) return;
      if (nextTabs.activeId) {
        await loadCanvasById(nextTabs.activeId);
        return;
      }
      // 删掉最后一张之后就真的是零张了 —— 不再自动补一张，否则永远删不干净
      activeIdRef.current = null;
      useCanvasStore.getState().reset();
      setSaveState('unsaved');
    },
    [loadCanvasById],
  );

  // 首次进入：URL 带 project 参数则读云端，否则恢复上次打开的那张本地画布
  useEffect(() => {
    let cancelled = false;
    const queryId = new URLSearchParams(window.location.search).get('project');

    async function restore() {
      // 只在「这套标签页第一次跑」的时候才去看老草稿；标记立刻落盘，
      // 这样以后哪怕用户把本地画布删光，也不会又把老画布接回来。
      const shouldMigrateLegacy = needsLegacyMigration();
      markLegacyMigrationDone();
      let list = loadCanvases();
      let openTabs = loadTabs();

      if (queryId) {
        try {
          const file = await loadProjectGraph(queryId);
          if (cancelled) return;
          let target = list.find((item) => item.projectId === queryId);
          if (!target) {
            target = { ...newCanvas(file.name), projectId: queryId };
            list = upsertCanvas(list, target);
          }
          openTabs = openTab(openTabs, target.id);
          saveCanvases(list);
          saveTabs(openTabs);
          activeIdRef.current = target.id;
          setCanvases(list);
          setTabs(openTabs);
          readyRef.current = true;
          useCanvasStore.getState().loadCanvas(file);
          setSaveState('cloud');
          window.history.replaceState(null, '', '/canvas');
          return;
        } catch {
          if (!cancelled) setSaveState('error');
          return;
        }
      }

      // 本地一张都没有：要么是第一次用（把老的单草稿接过来），要么是用户真的删光了。
      if (list.length === 0) {
        const legacy = shouldMigrateLegacy ? await loadDraft() : null;
        if (cancelled) return;

        if (!legacy) {
          // 删光就是删光，不再凭空造一张出来；这张空白画布动过了才会留下记录
          activeIdRef.current = null;
          saveCanvases([]);
          saveTabs(EMPTY_TABS);
          setCanvases([]);
          setTabs(EMPTY_TABS);
          readyRef.current = true;
          setSaveState('unsaved');
          return;
        }

        const canvas = newCanvas(legacy.name || '未命名画布');
        await saveDraft(legacy, draftKey(canvas.id));
        saveCanvases([canvas]);
        saveTabs({ open: [canvas.id], activeId: canvas.id });
        activeIdRef.current = canvas.id;
        setCanvases([canvas]);
        setTabs({ open: [canvas.id], activeId: canvas.id });
        readyRef.current = true;
        useCanvasStore.getState().loadCanvas(legacy);
        setSaveState('local');
        return;
      }

      const activeId =
        openTabs.activeId && list.some((item) => item.id === openTabs.activeId)
          ? openTabs.activeId
          : list[0].id;
      openTabs = activateTab(openTabs, activeId);
      if (openTabs.activeId !== activeId) openTabs = openTab(openTabs, activeId);
      const draft = await loadDraft(draftKey(activeId));
      if (cancelled) return;
      saveTabs(openTabs);
      activeIdRef.current = activeId;
      setCanvases(list);
      setTabs(openTabs);
      readyRef.current = true;
      if (draft) useCanvasStore.getState().loadCanvas(draft);
      setSaveState(draft ? 'local' : 'unsaved');
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // 画布变化后 1.5 秒防抖写本地草稿（写的是当前标签那份）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useCanvasStore.subscribe(() => {
      if (!readyRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const store = useCanvasStore.getState();
        let canvasId = activeIdRef.current;
        if (!canvasId) {
          // 删光本地画布后画的是一张「还没有归属」的空白画布：
          // 动过内容或改过名字，才给它补一条本地记录并挂上标签。
          if (!needsLocalEntry(store.name, store.nodes.length)) return;
          const canvas = newCanvas(store.name);
          const list = upsertCanvas(canvasesRef.current, canvas);
          saveCanvases(list);
          setCanvases(list);
          const nextTabs = openTab(tabsRef.current, canvas.id);
          saveTabs(nextTabs);
          setTabs(nextTabs);
          activeIdRef.current = canvas.id;
          canvasId = canvas.id;
        }
        void saveDraft(
          buildCanvasFile({
            name: store.name,
            nodes: store.nodes,
            edges: store.edges,
            viewport: store.viewport,
          }),
          draftKey(canvasId),
        )
          .then(() => {
            setCanvases((previous) => {
              const target = previous.find((item) => item.id === canvasId);
              if (!target || target.name === store.name) return previous;
              const next = renameCanvas(previous, canvasId, store.name);
              saveCanvases(next);
              return next;
            });
            setSaveState((previous) => (previous === 'cloud' ? previous : 'local'));
          })
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
    const canvasId = activeIdRef.current;
    const store = useCanvasStore.getState();
    const file = buildCanvasFile({
      name: store.name,
      nodes: store.nodes,
      edges: store.edges,
      viewport: store.viewport,
    });
    const current = canvasesRef.current.find((item) => item.id === canvasId) ?? null;

    setSaving(true);
    try {
      if (current?.projectId) {
        await updateProject(current.projectId, file, store.name);
      } else {
        const row = await createProject(store.name, file);
        if (canvasId) {
          // 记住这份本地画布对应哪个云端画布，下次保存就是更新它，不会又建一份
          const list = bindProject(renameCanvas(canvasesRef.current, canvasId, store.name), canvasId, row.id);
          saveCanvases(list);
          setCanvases(list);
        }
      }
      setSaveState('cloud');
    } catch {
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }, []);

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
  // 节点上能下载/复制的图片：图片节点和参考图片节点看 src，文本节点看它自带的参考图。
  const menuImageSrc = (() => {
    const data = menuNode?.data;
    if (!data) return null;
    if (data.kind === 'text') return data.referenceSrc ?? null;
    return data.src ?? null;
  })();

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
      <header className="absolute left-20 right-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 text-sm shadow">
        <CanvasTabs
          canvases={canvases}
          open={tabs.open}
          activeId={tabs.activeId}
          onActivate={(id) => void switchToCanvas(id)}
          onClose={(id) => void onCloseTab(id)}
          onCreate={() => void openNewCanvas()}
        />
      </header>

      {/* 画布名与保存挪到第二行，把上面整行留给标签页 */}
      <div className="absolute right-3 top-14 z-20 flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 text-sm shadow">
        <input
          aria-label="画布名称"
          value={name}
          onChange={(event) => useCanvasStore.getState().setName(event.target.value)}
          className="w-40 shrink-0 rounded border border-transparent px-1 py-0.5 font-medium text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:outline-none"
        />
        <span className="shrink-0 text-xs text-gray-400">{SAVE_LABEL[saveState]}</span>
        <button
          type="button"
          onClick={saveToCloud}
          disabled={saving}
          className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存到云端'}
        </button>
      </div>

      <CanvasToolbar
        tool={tool}
        onToolChange={setTool}
        addPosition={addPosition}
        onFitView={() => void fitView({ padding: 0.2 })}
      />
      <CanvasSettingsMenu
        canvases={canvases}
        openIds={tabs.open}
        onOpenCanvas={(id) => void switchToCanvas(id)}
        onDeleteCanvas={(id) => void deleteLocalCanvas(id)}
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
          // 在输入框里右键时不弹画布菜单，交给浏览器原生菜单，免得「粘贴文字」被抢走。
          if (isTextInputTarget(event.target)) return;
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
          if (isTextInputTarget(event.target)) return;
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
        {/* 左上角工具栏会盖住默认的左下角控件，往右挪开，免得点到「清空画布」。 */}
        <Controls style={{ left: 80 }} />
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
              label: '添加参考图片节点',
              run: () => useCanvasStore.getState().addReferenceNode(paneMenu.flow),
            },
            {
              label: '粘贴（Ctrl+V）',
              disabled: clipboardNodeCount() === 0,
              run: () => useCanvasStore.getState().pasteClipboard(paneMenu.flow),
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
              label: '复制（Ctrl+C）',
              run: () => useCanvasStore.getState().copySelected(),
            },
            {
              label: '剪切（Ctrl+X）',
              run: () => useCanvasStore.getState().cutSelected(),
            },
            {
              label: '粘贴到这里（Ctrl+V）',
              run: () => {
                const target = menuNode?.position;
                useCanvasStore
                  .getState()
                  .pasteClipboard(target ? { x: target.x + 48, y: target.y + 48 } : undefined);
              },
            },
            {
              label: '填写提示词',
              run: () => {
                document
                  .querySelector<HTMLTextAreaElement>(
                    `.react-flow__node[data-id="${nodeMenu.nodeId}"] textarea[aria-label="提示词"]`,
                  )
                  ?.focus();
              },
            },
            {
              label: '断开全部连线',
              run: () => useCanvasStore.getState().disconnectNode(nodeMenu.nodeId),
            },
            {
              label: '下载图片',
              disabled: !menuImageSrc,
              run: () => {
                if (menuImageSrc) void downloadImage(menuImageSrc);
              },
            },
            {
              label: '复制图片到剪贴板',
              disabled: !menuImageSrc,
              run: () => {
                if (menuImageSrc) {
                  void copyImageToClipboard(menuImageSrc).catch((error) => {
                    console.error('复制图片到剪贴板失败', error);
                  });
                }
              },
            },
            {
              label: menuNode?.data.aiOpen === false ? '打开 AI 对话框' : '关闭 AI 对话框',
              run: () => useCanvasStore.getState().toggleAiNode(nodeMenu.nodeId),
            },
            {
              label: menuNode?.data.locked ? '解锁位置' : '锁定位置',
              run: () => useCanvasStore.getState().toggleNodeLock(nodeMenu.nodeId),
            },
            {
              label: '复制节点',
              run: () => useCanvasStore.getState().duplicateNode(nodeMenu.nodeId),
            },
          ]}
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
