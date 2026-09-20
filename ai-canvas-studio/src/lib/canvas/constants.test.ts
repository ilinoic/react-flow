import { describe, expect, it } from 'vitest';
import { nodeIdPrefix, nodeSizeKey } from './constants';

describe('nodeSizeKey', () => {
  it('参考图片节点用自己的尺寸表', () => {
    expect(nodeSizeKey('reference')).toBe('reference');
  });

  it('文本与图片节点各归各的', () => {
    expect(nodeSizeKey('text')).toBe('text');
    expect(nodeSizeKey('image')).toBe('image');
  });

  it('类型缺失时按文本节点处理', () => {
    expect(nodeSizeKey(undefined)).toBe('text');
  });
});

describe('nodeIdPrefix', () => {
  it('三种节点各有前缀', () => {
    expect(nodeIdPrefix('text')).toBe('text');
    expect(nodeIdPrefix('image')).toBe('image');
    expect(nodeIdPrefix('reference')).toBe('ref');
  });

  it('类型缺失时按文本节点处理', () => {
    expect(nodeIdPrefix(undefined)).toBe('text');
  });
});
