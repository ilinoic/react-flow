import { describe, expect, it } from 'vitest';
import {
  buildCanvasFile,
  canvasFileName,
  parseCanvasFile,
  serializeCanvasFile,
} from './serialization';
import type { CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };
const viewport = { x: 0, y: 0, zoom: 1 };

const nodes: CanvasNode[] = [
  {
    id: 'n1',
    type: 'text',
    position: { x: 1, y: 2 },
    width: 240,
    height: 120,
    data: { kind: 'text', text: '你好', ai },
  },
];

describe('画布序列化', () => {
  it('构建的文件包含版本、时间与视口', () => {
    const file = buildCanvasFile({
      name: '示例',
      nodes,
      edges: [],
      viewport,
      now: new Date('2026-09-20T07:30:00Z'),
    });
    expect(file.version).toBe(1);
    expect(file.exportedAt).toBe('2026-09-20T07:30:00.000Z');
    expect(file.nodes).toHaveLength(1);
  });

  it('名称为空时回落到默认名', () => {
    expect(buildCanvasFile({ name: '', nodes: [], edges: [], viewport }).name).toBe('未命名画布');
  });

  it('序列化后能原样解析回来', () => {
    const file = buildCanvasFile({ name: '示例', nodes, edges: [], viewport });
    const roundTrip = parseCanvasFile(serializeCanvasFile(file));
    expect(roundTrip.nodes[0].data).toEqual(file.nodes[0].data);
    expect(serializeCanvasFile(roundTrip)).toBe(serializeCanvasFile(file));
  });

  it('非法 JSON 抛出中文错误', () => {
    expect(() => parseCanvasFile('{not json')).toThrow('画布 JSON 格式不正确');
    expect(() => parseCanvasFile(JSON.stringify({ version: 2 }))).toThrow('画布 JSON 格式不正确');
  });

  it('缺少必要字段的文件也会被拒绝', () => {
    const file = JSON.parse(serializeCanvasFile(buildCanvasFile({ name: 'x', nodes, edges: [], viewport })));
    delete file.nodes;
    expect(() => parseCanvasFile(JSON.stringify(file))).toThrow('画布 JSON 格式不正确');
  });

  it('文件名去掉不安全字符并带时间戳', () => {
    const local = new Date(2026, 8, 20, 7, 30);
    expect(canvasFileName('我的/画布: v1', local)).toBe('canvas-我的-画布- v1-20260920-0730.json');
  });

  it('空名称导出时用默认名', () => {
    expect(canvasFileName('', new Date(2026, 8, 20, 7, 30))).toBe('canvas-未命名画布-20260920-0730.json');
  });
});
