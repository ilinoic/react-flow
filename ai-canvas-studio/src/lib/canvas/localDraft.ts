import { parseCanvasFile, serializeCanvasFile } from './serialization';
import { extractImages, restoreImages } from './imageStore';
import type { CanvasFile } from './types';

export const DRAFT_KEY = 'ai-canvas:draft';

/**
 * 写本地草稿：大图先搬进 IndexedDB，localStorage 里只留引用。
 * localStorage 写不下时会抛错，由调用方提示用户。
 */
export async function saveDraft(file: CanvasFile): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const slim = await extractImages(file);
  localStorage.setItem(DRAFT_KEY, serializeCanvasFile(slim));
}

export async function loadDraft(): Promise<CanvasFile | null> {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return await restoreImages(parseCanvasFile(raw));
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}
