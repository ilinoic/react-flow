import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANVAS_LIST_KEY,
  MAX_LOCAL_CANVASES,
  OPEN_TABS_KEY,
  bindProject,
  closeTab,
  loadCanvases,
  loadTabs,
  newCanvas,
  markLegacyMigrationDone,
  markWelcomeCanvasDone,
  needsLocalEntry,
  needsLegacyMigration,
  needsWelcomeCanvas,
  openTab,
  pruneCanvases,
  renameCanvas,
  saveCanvases,
  saveTabs,
  upsertCanvas,
  type LocalCanvas,
} from './localCanvases';

const canvas = (id: string, updatedAt = '2026-09-24T00:00:00.000Z'): LocalCanvas => ({
  id,
  name: `画布 ${id}`,
  projectId: null,
  updatedAt,
});

describe('本地画布列表', () => {
  beforeEach(() => localStorage.clear());

  it('新建的画布叫「未命名画布」，还没绑云端', () => {
    const created = newCanvas();
    expect(created.name).toBe('未命名画布');
    expect(created.projectId).toBeNull();
    expect(created.id).toBeTruthy();
  });

  it('保存过就排在最前面', () => {
    const list = upsertCanvas([canvas('a')], canvas('b', '2026-09-24T01:00:00.000Z'));
    expect(list.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('同一张画布重复保存是更新，不是新增', () => {
    const list = upsertCanvas([canvas('a')], { ...canvas('a', '2026-09-24T02:00:00.000Z'), name: '改过名' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('改过名');
  });

  it('改名和绑云端都只动目标那条', () => {
    expect(renameCanvas([canvas('a'), canvas('b')], 'b', '新名字')[1].name).toBe('新名字');
    expect(bindProject([canvas('a'), canvas('b')], 'a', 'p-1')[0].projectId).toBe('p-1');
  });

  it('超过上限时丢最老的那张，打开着的绝不丢', () => {
    const many = Array.from({ length: MAX_LOCAL_CANVASES + 2 }, (_, index) =>
      canvas(`c${index}`, `2026-09-24T00:${String(index).padStart(2, '0')}:00.000Z`),
    );
    // 最老的那张正开着，应该保住，改丢第二老的
    const { kept, dropped } = pruneCanvases(many, ['c0']);
    expect(kept).toHaveLength(MAX_LOCAL_CANVASES);
    expect(kept.some((item) => item.id === 'c0')).toBe(true);
    expect(dropped).toEqual(['c1', 'c2']);
  });

  it('存得下也读得回来', () => {
    saveCanvases([canvas('a')]);
    expect(loadCanvases().map((item) => item.id)).toEqual(['a']);
    saveTabs({ open: ['a'], activeId: 'a' });
    expect(loadTabs()).toEqual({ open: ['a'], activeId: 'a' });
    expect(localStorage.getItem(CANVAS_LIST_KEY)).toContain('"a"');
    expect(localStorage.getItem(OPEN_TABS_KEY)).toContain('"activeId":"a"');
  });

  it('没存过、或者存坏了，都当空处理', () => {
    expect(loadCanvases()).toEqual([]);
    expect(loadTabs()).toEqual({ open: [], activeId: null });
    localStorage.setItem(CANVAS_LIST_KEY, '{oops');
    localStorage.setItem(OPEN_TABS_KEY, '不是 JSON');
    expect(loadCanvases()).toEqual([]);
    expect(loadTabs()).toEqual({ open: [], activeId: null });
  });

  it('空白画布不占本地记录，动过了才需要一条', () => {
    expect(needsLocalEntry('未命名画布', 0)).toBe(false);
    expect(needsLocalEntry('未命名画布', 1)).toBe(true);
    expect(needsLocalEntry('画布A', 0)).toBe(true);
    expect(needsLocalEntry('   ', 0)).toBe(false);
  });

  it('老草稿只接一次：迁过之后就不再复活它', () => {
    expect(needsLegacyMigration()).toBe(true);
    markLegacyMigrationDone();
    expect(needsLegacyMigration()).toBe(false);
  });

  it('欢迎画布也只送一次：删掉之后再刷新不会自己长回来', () => {
    expect(needsWelcomeCanvas()).toBe(true);
    markWelcomeCanvasDone();
    expect(needsWelcomeCanvas()).toBe(false);
  });
});

describe('标签页顺序', () => {
  it('打开一个画布会加进标签并切过去', () => {
    expect(openTab({ open: [], activeId: null }, 'a')).toEqual({ open: ['a'], activeId: 'a' });
    expect(openTab({ open: ['a'], activeId: 'a' }, 'b')).toEqual({ open: ['a', 'b'], activeId: 'b' });
  });

  it('已经开着的画布再打开只是切过去，不重复加', () => {
    expect(openTab({ open: ['a', 'b'], activeId: 'b' }, 'a')).toEqual({ open: ['a', 'b'], activeId: 'a' });
  });

  it('关掉当前标签后，切到它左边那个', () => {
    expect(closeTab({ open: ['a', 'b', 'c'], activeId: 'b' }, 'b')).toEqual({ open: ['a', 'c'], activeId: 'a' });
  });

  it('关掉最左边那个当前标签，切到新的第一个', () => {
    expect(closeTab({ open: ['a', 'b'], activeId: 'a' }, 'a')).toEqual({ open: ['b'], activeId: 'b' });
  });

  it('关掉不是当前的那个标签，当前标签不动', () => {
    expect(closeTab({ open: ['a', 'b'], activeId: 'a' }, 'b')).toEqual({ open: ['a'], activeId: 'a' });
  });

  it('关掉最后一个标签就没有当前标签了', () => {
    expect(closeTab({ open: ['a'], activeId: 'a' }, 'a')).toEqual({ open: [], activeId: null });
  });
});
