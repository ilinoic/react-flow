import { describe, expect, it } from 'vitest';
import {
  createMemoryImageStore,
  extractImages,
  isImageRef,
  restoreImages,
} from './imageStore';
import type { CanvasFile, CanvasNode } from './types';

const ai = { messages: [], status: 'idle' as const };
const bigImage = `data:image/png;base64,${'A'.repeat(40000)}`;
const smallImage = 'data:image/svg+xml;charset=utf-8,%3Csvg%20%2F%3E';

function imageNode(src: string | null, messageImage?: string): CanvasNode {
  return {
    id: 'i1',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      src,
      alt: '图片节点',
      prompt: '',
      ai: messageImage
        ? {
            messages: [
              { id: 'm1', role: 'assistant', text: '生成', imageSrc: messageImage, createdAt: '2026-09-20T00:00:00.000Z' },
            ],
            status: 'idle',
          }
        : ai,
    },
  };
}

function canvasOf(nodes: CanvasNode[]): CanvasFile {
  return {
    version: 1,
    name: '测试',
    exportedAt: '2026-09-20T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
  };
}

describe('把大图从草稿里挪到图片仓库', () => {
  it('大图换成引用，草稿本身保持很小', async () => {
    const store = createMemoryImageStore();
    const slim = await extractImages(canvasOf([imageNode(bigImage)]), store);

    const src = slim.nodes[0].data.src as string;
    expect(isImageRef(src)).toBe(true);
    expect(JSON.stringify(slim).length).toBeLessThan(1000);
    expect(await store.get(src)).toBe(bigImage);
  });

  it('小图（模拟模式的占位图之类）留在草稿里，方便单文件导出', async () => {
    const store = createMemoryImageStore();
    const slim = await extractImages(canvasOf([imageNode(smallImage)]), store);

    expect(slim.nodes[0].data.src).toBe(smallImage);
    expect(await store.get(smallImage)).toBeNull();
  });

  it('同一张图在节点和对话记录里各存一次，只占一份', async () => {
    const store = createMemoryImageStore();
    const slim = await extractImages(canvasOf([imageNode(bigImage, bigImage)]), store);

    const src = slim.nodes[0].data.src as string;
    const messageImage = slim.nodes[0].data.ai.messages[0].imageSrc as string;
    expect(messageImage).toBe(src);
  });

  it('还原之后跟原始画布完全一致', async () => {
    const store = createMemoryImageStore();
    const original = canvasOf([imageNode(bigImage, bigImage)]);

    const roundTrip = await restoreImages(await extractImages(original, store), store);
    expect(roundTrip).toEqual(original);
  });

  it('找不到图片本体时清空该字段，而不是留一个坏地址', async () => {
    const store = createMemoryImageStore();
    const slim = await extractImages(canvasOf([imageNode(bigImage)]), store);

    const restored = await restoreImages(slim, createMemoryImageStore());
    expect(restored.nodes[0].data.src).toBeNull();
  });

  it('已经是引用的画布再存一次不会重复处理', async () => {
    const store = createMemoryImageStore();
    const once = await extractImages(canvasOf([imageNode(bigImage)]), store);
    const twice = await extractImages(once, store);
    expect(twice).toEqual(once);
  });
});
