import type { AiConfig, AiImageReference } from './types';

type ImageInput = {
  prompt: string;
  texts: string[];
  images: AiImageReference[];
  size: string;
};

type TextInput = {
  prompt: string;
  texts: string[];
  images: AiImageReference[];
};

function escapeXml(value: string): string {
  const map: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  };
  return value.replace(/[<>&'"]/g, (char) => map[char]!);
}

export function buildPrompt(prompt: string, texts: string[]): string {
  const clean = texts.map((item) => item.trim()).filter(Boolean);
  if (clean.length === 0) return prompt;
  return `${prompt}\n\n参考信息：\n${clean.map((item) => `- ${item}`).join('\n')}`;
}

/** 模拟模式用的占位图：确定性 SVG，不联网。 */
export function mockImageDataUrl(text: string): string {
  const label = escapeXml(text.replace(/\s+/g, ' ').slice(0, 40) || '模拟图片');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
    `<rect width="100%" height="100%" fill="#eef2ff"/>` +
    `<text x="50%" y="50%" text-anchor="middle" font-size="22" fill="#334155">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

async function readImageResponse(response: Response): Promise<{ imageSrc: string }> {
  if (!response.ok) {
    throw new Error(`AI 接口请求失败（${response.status}）：${(await response.text()).slice(0, 300)}`);
  }
  const json = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = json.data?.[0];
  if (first?.b64_json) return { imageSrc: `data:image/png;base64,${first.b64_json}` };
  if (first?.url) return { imageSrc: first.url };
  throw new Error('AI 接口返回里没有图片数据');
}

function jsonHeaders(config: AiConfig) {
  return { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
}

export async function generateImage(
  config: AiConfig,
  input: ImageInput,
): Promise<{ imageSrc: string }> {
  const prompt = buildPrompt(input.prompt, input.texts);
  if (config.provider === 'mock') return { imageSrc: mockImageDataUrl(prompt) };

  const base = config.baseUrl.replace(/\/+$/, '');

  if (input.images.length === 0) {
    const response = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: jsonHeaders(config),
      body: JSON.stringify({ model: config.imageModel, prompt, size: input.size, n: 1 }),
    });
    return readImageResponse(response);
  }

  const form = new FormData();
  form.append('model', config.imageModel);
  form.append('prompt', prompt);
  form.append('size', input.size);
  input.images.forEach((image, index) => {
    const field = input.images.length > 1 ? 'image[]' : 'image';
    form.append(field, dataUrlToBlob(image.dataUrl), `${index}.png`);
  });

  const response = await fetch(`${base}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });
  return readImageResponse(response);
}

export async function generateText(
  config: AiConfig,
  input: TextInput,
): Promise<{ text: string }> {
  const prompt = buildPrompt(input.prompt, input.texts);
  if (config.provider === 'mock') return { text: `【模拟输出】${prompt}` };

  const base = config.baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: jsonHeaders(config),
    body: JSON.stringify({ model: config.textModel, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!response.ok) {
    throw new Error(`AI 文本接口请求失败（${response.status}）：${(await response.text()).slice(0, 300)}`);
  }
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: json.choices?.[0]?.message?.content ?? '' };
}
