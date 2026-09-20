import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft } from './localDraft';
import { buildCanvasFile } from './serialization';
import type { CanvasNode } from './types';

const file = buildCanvasFile({
  name: '草稿',
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

const bigImage = `data:image/png;base64,${'A'.repeat(40000)}`;
const nodeWithImage: CanvasNode = {
  id: 'i1',
  type: 'image',
  position: { x: 0, y: 0 },
  data: { kind: 'image', src: bigImage, alt: '图片节点', prompt: '', ai: { messages: [], status: 'idle' } },
};

describe('本地草稿', () => {
  beforeEach(() => localStorage.clear());

  it('保存后可读回', async () => {
    await saveDraft(file);
    expect((await loadDraft())?.name).toBe('草稿');
    expect(localStorage.getItem(DRAFT_KEY)).toContain('"version": 1');
  });

  it('没有草稿时返回 null', async () => {
    expect(await loadDraft()).toBeNull();
  });

  it('草稿损坏时返回 null 而不抛错', async () => {
    localStorage.setItem(DRAFT_KEY, '{broken');
    expect(await loadDraft()).toBeNull();
  });

  it('可以清除草稿', async () => {
    await saveDraft(file);
    clearDraft();
    expect(await loadDraft()).toBeNull();
  });

  it('大图不会进 localStorage，读回来时再补上', async () => {
    const withImage = buildCanvasFile({
      name: '带图草稿',
      nodes: [nodeWithImage],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    await saveDraft(withImage);

    expect(localStorage.getItem(DRAFT_KEY)!.length).toBeLessThan(2000);
    const restored = await loadDraft();
    expect((restored?.nodes[0].data as { src: string | null }).src).toBe(bigImage);
  });

  it('localStorage 写不进去时抛错，交给调用方提示用户', async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      await expect(saveDraft(file)).rejects.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
