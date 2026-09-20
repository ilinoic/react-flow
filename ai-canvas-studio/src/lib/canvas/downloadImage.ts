const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export function imageFileName(mimeType: string, now: Date = new Date()): string {
  const extension = EXTENSION_BY_MIME[mimeType.split(';')[0].trim().toLowerCase()] ?? 'png';
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `canvas-image-${stamp}.${extension}`;
}

/** 私有桶里的图片是带签名的地址，直接给 <a download> 不生效，先取回 blob 再下载。 */
export async function downloadImage(src: string): Promise<void> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = imageFileName(blob.type || response.headers.get('content-type') || 'image/png');
  link.click();
  URL.revokeObjectURL(url);
}
