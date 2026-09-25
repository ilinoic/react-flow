import { parseCanvasFile, serializeCanvasFile } from './serialization';
import { extractImages, restoreImages } from './imageStore';
import type { CanvasFile } from './types';

export const DRAFT_KEY = 'ai-canvas:draft';

/** 每张本地画布一份草稿：一张画布一个 key，互相不覆盖。 */
export function draftKey(canvasId: string): string {
  return `${DRAFT_KEY}:${canvasId}`;
}

/**
 * 写本地草稿：大图先搬进 IndexedDB，localStorage 里只留引用。
 * localStorage 写不下时会抛错，由调用方提示用户。
 */
export async function saveDraft(file: CanvasFile, key: string = DRAFT_KEY): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const slim = await extractImages(file);
  localStorage.setItem(key, serializeCanvasFile(slim));
}

export async function loadDraft(key: string = DRAFT_KEY): Promise<CanvasFile | null> {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return await restoreImages(parseCanvasFile(raw));
  } catch {
    return null;
  }
}

export function clearDraft(key: string = DRAFT_KEY): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
}
