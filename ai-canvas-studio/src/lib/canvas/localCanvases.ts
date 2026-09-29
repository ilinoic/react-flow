/**
 * 本地画布清单：顶部标签页打开的就是这些。
 *
 * 每张画布各自有一份草稿（见 localDraft 的 draftKey），关掉标签只是把它从
 * 「打开的列表」里拿掉，草稿还在本地，随时能从设置里再打开。
 */

export const CANVAS_LIST_KEY = 'ai-canvas:canvases';
export const OPEN_TABS_KEY = 'ai-canvas:open-tabs';
export const MIGRATION_KEY = 'ai-canvas:tabs-migrated';
export const WELCOME_KEY = 'ai-canvas:welcome-template';
/** 本地最多留这么多张画布，新建时把最老的、而且没开着的丢掉。 */
export const MAX_LOCAL_CANVASES = 20;

export type LocalCanvas = {
  id: string;
  name: string;
  /** 云端画布 id；纯本地新建的是 null，下次「保存到云端」会新建一份而不是覆盖别人。 */
  projectId: string | null;
  updatedAt: string;
};

export type OpenTabs = {
  open: string[];
  activeId: string | null;
};

export const EMPTY_TABS: OpenTabs = { open: [], activeId: null };

let seq = 0;

export function newCanvasId(): string {
  seq += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `cv_${Date.now().toString(36)}_${seq}_${random}`;
}

export function newCanvas(name = '未命名画布', now: Date = new Date()): LocalCanvas {
  return { id: newCanvasId(), name, projectId: null, updatedAt: now.toISOString() };
}

/**
 * 空白画布（没节点、还是默认名）不占本地记录 —— 否则「删光本地画布」永远删不干净，
 * 一删就冒出一张新的。动过内容或者改过名字，才值得留一条。
 */
export function needsLocalEntry(name: string, nodeCount: number): boolean {
  if (nodeCount > 0) return true;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed !== '未命名画布';
}

/** 保存过（或改名过）的画布排到最前面。 */
export function upsertCanvas(canvases: LocalCanvas[], canvas: LocalCanvas): LocalCanvas[] {
  const rest = canvases.filter((item) => item.id !== canvas.id);
  return [canvas, ...rest].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function renameCanvas(canvases: LocalCanvas[], id: string, name: string): LocalCanvas[] {
  return canvases.map((item) => (item.id === id ? { ...item, name } : item));
}

export function bindProject(
  canvases: LocalCanvas[],
  id: string,
  projectId: string | null,
): LocalCanvas[] {
  return canvases.map((item) => (item.id === id ? { ...item, projectId } : item));
}

export function touchCanvas(canvases: LocalCanvas[], id: string, now: Date = new Date()): LocalCanvas[] {
  return upsertCanvas(
    canvases,
    { ...(canvases.find((item) => item.id === id) ?? newCanvas()), id, updatedAt: now.toISOString() },
  );
}

export function openTab(tabs: OpenTabs, id: string): OpenTabs {
  if (tabs.open.includes(id)) return { ...tabs, activeId: id };
  return { open: [...tabs.open, id], activeId: id };
}

/** 关标签只关掉「打开」这件事；当前标签被关掉就切到左边那个，没有左边就取右边。 */
export function closeTab(tabs: OpenTabs, id: string): OpenTabs {
  const index = tabs.open.indexOf(id);
  if (index === -1) return tabs;
  const open = tabs.open.filter((item) => item !== id);
  if (tabs.activeId !== id) return { open, activeId: tabs.activeId };
  const next = open[Math.max(0, index - 1)] ?? null;
  return { open, activeId: next };
}

export function activateTab(tabs: OpenTabs, id: string): OpenTabs {
  return tabs.open.includes(id) ? { ...tabs, activeId: id } : tabs;
}

/** 超上限时按「最老优先」丢，但打开着的绝不丢。 */
export function pruneCanvases(
  canvases: LocalCanvas[],
  open: string[],
): { kept: LocalCanvas[]; dropped: string[] } {
  if (canvases.length <= MAX_LOCAL_CANVASES) return { kept: canvases, dropped: [] };

  const oldestFirst = [...canvases].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const dropped: string[] = [];
  for (const canvas of oldestFirst) {
    if (canvases.length - dropped.length <= MAX_LOCAL_CANVASES) break;
    if (open.includes(canvas.id)) continue;
    dropped.push(canvas.id);
  }
  return { kept: canvases.filter((item) => !dropped.includes(item.id)), dropped };
}

export function loadCanvases(): LocalCanvas[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CANVAS_LIST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalCanvas =>
        Boolean(item) &&
        typeof (item as LocalCanvas).id === 'string' &&
        typeof (item as LocalCanvas).name === 'string',
    );
  } catch {
    return [];
  }
}

export function saveCanvases(canvases: LocalCanvas[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CANVAS_LIST_KEY, JSON.stringify(canvases));
}

export function loadTabs(): OpenTabs {
  if (typeof localStorage === 'undefined') return EMPTY_TABS;
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY);
    if (!raw) return EMPTY_TABS;
    const parsed = JSON.parse(raw) as OpenTabs;
    if (!Array.isArray(parsed?.open)) return EMPTY_TABS;
    return { open: parsed.open, activeId: parsed.activeId ?? null };
  } catch {
    return EMPTY_TABS;
  }
}

export function saveTabs(tabs: OpenTabs): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs));
}

/**
 * 老的单草稿（ai-canvas:draft）只往标签页里接一次。
 * 少了这个标记，「本地画布删光」之后一刷新就会把老草稿又接回来，看着就像删不掉。
 */
export function needsLegacyMigration(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(MIGRATION_KEY) === null;
}

export function markLegacyMigrationDone(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(MIGRATION_KEY, '1');
}

/**
 * 第一次打开网站时要不要送一张站点自带模板当见面礼。
 * 只送一次：删掉之后再刷新不会自己长回来（见 markWelcomeCanvasDone）。
 */
export function needsWelcomeCanvas(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(WELCOME_KEY) === null;
}

export function markWelcomeCanvasDone(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(WELCOME_KEY, '1');
}
