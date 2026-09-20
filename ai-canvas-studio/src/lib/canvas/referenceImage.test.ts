import { describe, expect, it } from 'vitest';
import { fitReferenceSize } from './referenceImage';

describe('fitReferenceSize（参考图尺寸规范化）', () => {
  it('尺寸已经合规时原样返回', () => {
    expect(fitReferenceSize(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('最小的边小于 512 时整体放大', () => {
    expect(fitReferenceSize(300, 200)).toEqual({ width: 768, height: 512 });
  });

  it('最大的边超过 4096 时整体缩小', () => {
    expect(fitReferenceSize(6000, 4000)).toEqual({ width: 4096, height: 2731 });
  });

  it('极端比例时优先保证不超过 4096', () => {
    expect(fitReferenceSize(2000, 200)).toEqual({ width: 4096, height: 410 });
  });

  it('返回整数，不会出现小数像素', () => {
    const size = fitReferenceSize(1234, 777);
    expect(Number.isInteger(size.width)).toBe(true);
    expect(Number.isInteger(size.height)).toBe(true);
  });
});
