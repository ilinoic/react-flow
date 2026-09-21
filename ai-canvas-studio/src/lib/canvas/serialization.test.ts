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
    data: { kind: 'text', text: '你好', prompt: '写一句问候', ai },
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

  it('关掉「基于当前图修改」也会跟画布一起保存与恢复', () => {
    const file = buildCanvasFile({
      name: '示例',
      viewport,
      edges: [],
      nodes: [
        {
          id: 'i1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            src: 'data:image/png;base64,AAAA',
            alt: '图片节点',
            prompt: '把背景换成夜晚',
            basedOnCurrent: false,
            ai,
          },
        },
      ],
    });

    const roundTrip = parseCanvasFile(serializeCanvasFile(file));
    expect(roundTrip.nodes[0].data).toMatchObject({ basedOnCurrent: false });
  });

  it('节点上的提示词会跟画布一起保存与恢复', () => {
    const file = buildCanvasFile({ name: '示例', nodes, edges: [], viewport });
    const roundTrip = parseCanvasFile(serializeCanvasFile(file));
    expect((roundTrip.nodes[0].data as { prompt?: string }).prompt).toBe('写一句问候');
  });

  it('节点的锁定状态和 AI 对话框开关也会保存', () => {
    const withFlags: CanvasNode[] = [
      {
        ...nodes[0],
        draggable: false,
        data: { ...nodes[0].data, prompt: 'x', locked: true, aiOpen: false },
      } as CanvasNode,
    ];
    const file = buildCanvasFile({ name: '示例', nodes: withFlags, edges: [], viewport });
    const roundTrip = parseCanvasFile(serializeCanvasFile(file));
    const data = roundTrip.nodes[0].data as { locked?: boolean; aiOpen?: boolean };

    expect(data.locked).toBe(true);
    expect(data.aiOpen).toBe(false);
  });

  it('旧画布里没有提示词的节点也能读进来', () => {
    const file = JSON.parse(serializeCanvasFile(buildCanvasFile({ name: 'x', nodes, edges: [], viewport })));
    delete file.nodes[0].data.prompt;
    const roundTrip = parseCanvasFile(JSON.stringify(file));
    expect(roundTrip.nodes[0].data.kind).toBe('text');
  });

  it('参考图片节点与节点自带参考图都能存下来', () => {
    const withReferences: CanvasNode[] = [
      {
        id: 'r1',
        type: 'reference',
        position: { x: 0, y: 0 },
        width: 240,
        height: 300,
        data: { kind: 'reference', src: 'data:image/png;base64,REF', prompt: '换个背景', ai },
      },
      {
        id: 'i1',
        type: 'image',
        position: { x: 300, y: 0 },
        width: 240,
        height: 300,
        data: {
          kind: 'image',
          src: null,
          alt: '图片节点',
          prompt: '证件照',
          referenceSrc: 'data:image/png;base64,LOCAL',
          ai,
        },
      },
    ];

    const file = buildCanvasFile({ name: '示例', nodes: withReferences, edges: [], viewport });
    const roundTrip = parseCanvasFile(serializeCanvasFile(file));

    expect((roundTrip.nodes[0].data as { src: string | null }).src).toBe('data:image/png;base64,REF');
    expect((roundTrip.nodes[1].data as { referenceSrc?: string }).referenceSrc).toBe('data:image/png;base64,LOCAL');
  });

  it('文件名去掉不安全字符并带时间戳', () => {
    const local = new Date(2026, 8, 20, 7, 30);
    expect(canvasFileName('我的/画布: v1', local)).toBe('canvas-我的-画布- v1-20260920-0730.json');
  });

  it('空名称导出时用默认名', () => {
    expect(canvasFileName('', new Date(2026, 8, 20, 7, 30))).toBe('canvas-未命名画布-20260920-0730.json');
  });
});
