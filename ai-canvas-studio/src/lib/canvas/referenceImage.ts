/**
 * 节点自带的参考图：直接存成 data URL，跟画布一起保存，
 * 不依赖 Supabase 登录，也不会像签名 URL 那样过期。
 */

/** 百炼图像编辑接口对输入图的限制：宽高都在 512~4096 之间。 */
export const REFERENCE_MIN_EDGE = 512;
export const REFERENCE_MAX_EDGE = 4096;

export type ImageSize = { width: number; height: number };

/** 把尺寸收进出图接口能接受的区间，尽量保持原比例。 */
export function fitReferenceSize(width: number, height: number): ImageSize {
  const maxEdge = Math.max(width, height);
  const minEdge = Math.min(width, height);
  let scale = 1;

  if (minEdge < REFERENCE_MIN_EDGE) scale = REFERENCE_MIN_EDGE / minEdge;
  // 极端长宽比放大后会超出上限，此时以不超过上限为准。
  if (maxEdge * scale > REFERENCE_MAX_EDGE) scale = REFERENCE_MAX_EDGE / maxEdge;

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('参考图读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 读文件 → 必要时缩放到合规尺寸 → data URL。
 * 浏览器不支持 canvas / 解码失败时退回原图，保证功能可用。
 */
export async function toReferenceImageDataUrl(file: File): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return raw;

  try {
    const bitmap = await createImageBitmap(file);
    const target = fitReferenceSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return raw;

    context.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close?.();
    const scaled = canvas.toDataURL('image/jpeg', 0.9);
    return scaled.startsWith('data:image/jpeg') ? scaled : raw;
  } catch {
    return raw;
  }
}
