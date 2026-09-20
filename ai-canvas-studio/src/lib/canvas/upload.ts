import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const CANVAS_IMAGE_BUCKET = 'canvas-images';
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function canvasImagePath(userId: string, fileName: string, now: Date = new Date()): string {
  return `${userId}/${now.getTime()}-${fileName.replace(/[\\/\s]+/g, '_')}`;
}

export type UploadedImage = { path: string; src: string };

export async function uploadCanvasImage(file: File, userId: string): Promise<UploadedImage> {
  const supabase = createSupabaseBrowserClient();
  const path = canvasImagePath(userId, file.name);

  const { error } = await supabase.storage
    .from(CANVAS_IMAGE_BUCKET)
    .upload(path, file, { upsert: false });
  if (error) throw new Error(`图片上传失败：${error.message}`);

  const { data, error: signError } = await supabase.storage
    .from(CANVAS_IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    throw new Error(`生成图片地址失败：${signError?.message ?? '未知错误'}`);
  }

  return { path, src: data.signedUrl };
}
