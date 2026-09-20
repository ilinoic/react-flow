import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyImageToClipboard, dataUrlToBlob } from './clipboardImage';

const pngDataUrl = `data:image/png;base64,${btoa(String.fromCharCode(137, 80, 78, 71))}`;

describe('复制图片到剪贴板', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('base64 的 data URL 能转成 Blob', async () => {
    const blob = dataUrlToBlob(pngDataUrl);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(4);
  });

  it('写进剪贴板的是图片类型', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );

    await copyImageToClipboard(pngDataUrl);

    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { items: Record<string, Blob> };
    expect(Object.keys(item.items)).toEqual(['image/png']);
  });

  it('浏览器不支持写剪贴板时抛人话', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(copyImageToClipboard(pngDataUrl)).rejects.toThrow(/不支持/);
  });
});
