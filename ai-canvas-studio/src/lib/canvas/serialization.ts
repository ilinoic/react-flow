import { z } from 'zod';
import type { Viewport } from '@xyflow/react';
import type { CanvasEdge, CanvasFile, CanvasNode } from './types';

const positionSchema = z.object({ x: z.number(), y: z.number() });

const aiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  imageSrc: z.string().optional(),
  createdAt: z.string(),
});

const aiStateSchema = z.object({
  messages: z.array(aiMessageSchema),
  status: z.enum(['idle', 'running', 'error']),
  error: z.string().optional(),
});

const dataSchema = z.union([
  z.object({ kind: z.literal('text'), text: z.string(), ai: aiStateSchema }),
  z.object({
    kind: z.literal('image'),
    src: z.string().nullable(),
    storagePath: z.string().optional(),
    alt: z.string(),
    ai: aiStateSchema,
  }),
]);

const nodeSchema = z
  .object({
    id: z.string(),
    type: z.enum(['text', 'image']),
    position: positionSchema,
    width: z.number().optional(),
    height: z.number().optional(),
    selected: z.boolean().optional(),
    data: dataSchema,
  })
  .passthrough();

const edgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.literal('reference').optional(),
    animated: z.boolean().optional(),
    data: z.object({ relation: z.literal('reference') }).optional(),
  })
  .passthrough();

export const canvasFileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  exportedAt: z.string(),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
}) as unknown as z.ZodType<CanvasFile>;

export function buildCanvasFile(input: {
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  now?: Date;
}): CanvasFile {
  return {
    version: 1,
    name: input.name || '未命名画布',
    exportedAt: (input.now ?? new Date()).toISOString(),
    viewport: input.viewport,
    nodes: input.nodes,
    edges: input.edges,
  };
}

export function serializeCanvasFile(file: CanvasFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * 注意：存放在私有桶里的图片，`src` 是签名 URL（会过期）。
 * 导出文件同时保留 `storagePath`，Phase 2 支持把图片内联为 base64。
 */
export function parseCanvasFile(text: string): CanvasFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('画布 JSON 格式不正确');
  }

  const parsed = canvasFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error('画布 JSON 格式不正确');
  return parsed.data;
}

export function canvasFileName(name: string, now: Date = new Date()): string {
  const safe = (name || '未命名画布').replace(/[\\/:*?"<>|]/g, '-').trim();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `canvas-${safe}-${stamp}.json`;
}

export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
