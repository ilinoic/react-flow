import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCanvasFile } from './serialization';

// 模板是给用户「导入画布」用的，格式必须和导出文件一致；
// 这里直接把 public/templates 下的每个模板喂给真正的解析器，防止手写 JSON 写坏。
const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/templates');

const templates = readdirSync(TEMPLATE_DIR).filter((name) => name.endsWith('.json'));

describe('画布模板', () => {
  it('至少有一个模板文件', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates)('%s 能直接导入画布', (name) => {
    const file = parseCanvasFile(readFileSync(join(TEMPLATE_DIR, name), 'utf8'));

    const ids = file.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const node of file.nodes) {
      // type 和 data.kind 不一致时，画布会挑错组件，节点直接渲染不出来。
      expect(node.type).toBe(node.data.kind);
      expect(node.width ?? 0).toBeGreaterThan(0);
      expect(node.height ?? 0).toBeGreaterThan(0);
    }

    for (const edge of file.edges) {
      // 两端节点不存在就是断线，导入后看不见。
      expect(ids).toContain(edge.source);
      expect(ids).toContain(edge.target);
      expect(edge.type).toBe('reference');
      expect(edge.data?.relation).toBe('reference');
    }

    // 模板是给人看的，节点叠在一起就没法用了。
    for (const [index, node] of file.nodes.entries()) {
      for (const other of file.nodes.slice(index + 1)) {
        const overlapX =
          node.position.x < other.position.x + (other.width ?? 0) && other.position.x < node.position.x + (node.width ?? 0);
        const overlapY =
          node.position.y < other.position.y + (other.height ?? 0) && other.position.y < node.position.y + (node.height ?? 0);
        expect(overlapX && overlapY, `${node.id} 和 ${other.id} 叠在一起了`).toBe(false);
      }
    }

    expect(file.viewport.zoom).toBeGreaterThan(0);
  });
});
