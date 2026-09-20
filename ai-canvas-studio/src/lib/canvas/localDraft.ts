import { parseCanvasFile, serializeCanvasFile } from './serialization';
import type { CanvasFile } from './types';

export const DRAFT_KEY = 'ai-canvas:draft';

export function saveDraft(file: CanvasFile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DRAFT_KEY, serializeCanvasFile(file));
}

export function loadDraft(): CanvasFile | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return parseCanvasFile(raw);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}
