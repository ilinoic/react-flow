import { parseCanvasFile } from './serialization';
import type { CanvasFile } from './types';

export type ImportResult =
  | { ok: true; file: CanvasFile }
  | { ok: false; error: string };

export function isCanvasJsonFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
}

export async function importCanvasFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return { ok: true, file: parseCanvasFile(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '导入失败' };
  }
}
