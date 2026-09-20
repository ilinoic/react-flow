import { describe, expect, it } from 'vitest';
import { importCanvasFile, isCanvasJsonFile } from './importCanvas';
import { buildCanvasFile, serializeCanvasFile } from './serialization';
import type { CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };
const nodes: CanvasNode[] = [
  {
    id: 'n1',
    type: 'text',
    position: { x: 12, y: 24 },
    width: 240,
    height: 120,
    data: { kind: 'text', text: '导入进来的文本', prompt: '', ai },
  },
];

const validJson = serializeCanvasFile(
  buildCanvasFile({ name: '导入测试', nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
);

const makeFile = (content: string, name = 'canvas.json', type = 'application/json') =>
  new File([content], name, { type });

describe('importCanvasFile', () => {
  it('合法文件能解析出画布内容', async () => {
    const result = await importCanvasFile(makeFile(validJson));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.name).toBe('导入测试');
      expect(result.file.nodes[0].data).toEqual(nodes[0].data);
    }
  });

  it('内容不是 JSON 时返回可读错误', async () => {
    const result = await importCanvasFile(makeFile('{ 这不是 json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('画布 JSON 格式不正确');
  });

  it('JSON 结构不对时也返回可读错误', async () => {
    const result = await importCanvasFile(makeFile(JSON.stringify({ hello: 'world' })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('画布 JSON 格式不正确');
  });
});

describe('isCanvasJsonFile', () => {
  it('按扩展名与 MIME 判断', () => {
    expect(isCanvasJsonFile(makeFile('{}', 'a.json'))).toBe(true);
    expect(isCanvasJsonFile(makeFile('{}', 'a.JSON'))).toBe(true);
    expect(isCanvasJsonFile(makeFile('{}', 'a.png', 'image/png'))).toBe(false);
  });
});
