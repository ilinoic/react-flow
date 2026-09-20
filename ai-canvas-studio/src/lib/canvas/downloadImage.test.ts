import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage, imageFileName } from './downloadImage';

describe('imageFileName', () => {
  it('按 MIME 给出扩展名', () => {
    expect(imageFileName('image/png', new Date(2026, 8, 20, 9, 5))).toBe('canvas-image-20260920-0905.png');
    expect(imageFileName('image/jpeg', new Date(2026, 8, 20, 9, 5))).toBe('canvas-image-20260920-0905.jpg');
    expect(imageFileName('image/svg+xml', new Date(2026, 8, 20, 9, 5))).toBe('canvas-image-20260920-0905.svg');
    expect(imageFileName('image/webp', new Date(2026, 8, 20, 9, 5))).toBe('canvas-image-20260920-0905.webp');
  });

  it('认不出的类型回落到 png', () => {
    expect(imageFileName('application/octet-stream', new Date(2026, 8, 20, 9, 5))).toBe('canvas-image-20260920-0905.png');
  });
});

describe('downloadImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('拉取图片、触发下载并清理临时地址', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200, headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);

    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadImage('https://example.com/a.png');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/a.png');
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('拉取失败时抛出可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(downloadImage('https://example.com/missing.png')).rejects.toThrow('图片下载失败（404）');
  });
});
