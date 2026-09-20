/** 把签名 URL / 远程地址转成 data URL，便于作为参考图发给服务端。 */
export async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;

  const response = await fetch(src);
  if (!response.ok) throw new Error(`参考图读取失败（${response.status}）`);

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('参考图转换失败'));
    reader.readAsDataURL(blob);
  });
}
