/** 把一张图直接放进系统剪贴板，方便粘到聊天窗口、文档里。 */

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body = ''] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  if (!header.includes('base64')) {
    return new Blob([decodeURIComponent(body)], { type: mime });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export async function copyImageToClipboard(src: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('这个浏览器不支持把图片写进剪贴板');
  }

  const blob = src.startsWith('data:') ? dataUrlToBlob(src) : await (await fetch(src)).blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}
