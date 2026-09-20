import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft } from './localDraft';
import { buildCanvasFile } from './serialization';

const file = buildCanvasFile({
  name: '草稿',
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

describe('本地草稿', () => {
  beforeEach(() => localStorage.clear());

  it('保存后可读回', () => {
    saveDraft(file);
    expect(loadDraft()?.name).toBe('草稿');
    expect(localStorage.getItem(DRAFT_KEY)).toContain('"version": 1');
  });

  it('没有草稿时返回 null', () => {
    expect(loadDraft()).toBeNull();
  });

  it('草稿损坏时返回 null 而不抛错', () => {
    localStorage.setItem(DRAFT_KEY, '{broken');
    expect(loadDraft()).toBeNull();
  });

  it('可以清除草稿', () => {
    saveDraft(file);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
