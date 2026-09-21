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

/**
 * 改图接口对提示词长度比文生图敏感得多：实测 1500 字正常，
 * 2500 字以上百炼会直接返回 `submit algo service error, Internal server error!`。
 * 所以走改图时把提示词压到这个长度以内 —— 先保住用户自己写的那句指令，
 * 剩下的额度才留给连线带来的参考信息。
 */
export const IMAGE_EDIT_PROMPT_LIMIT = 1500;

export function clampEditPrompt(
  prompt: string,
  texts: string[],
  limit: number = IMAGE_EDIT_PROMPT_LIMIT,
): string {
  const full = buildPrompt(prompt, texts);
  if (full.length <= limit) return full;
  if (prompt.length >= limit) return prompt.slice(0, limit);
  return prompt + full.slice(prompt.length, limit);
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
  if (config.provider === 'qwen') return generateQwenImage(config, input);

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
  // 带底图的这次是「图改图」，用设置里单独的模型；没填就沿用图片模型。
  form.append('model', (config.imageEditModel ?? '').trim() || config.imageModel);
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

export type QwenImageOptions = { pollIntervalMs?: number; maxPolls?: number };

function dashscopeOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return 'https://dashscope.aliyuncs.com';
  }
}

async function inlineRemoteImage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) return url;
  const blob = await response.blob();
  // 过大的图不内联，避免画布 JSON 膨胀
  if (blob.size > 4 * 1024 * 1024) return url;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

/**
 * 通义千问（阿里云百炼）的出图走原生异步接口：
 * 提交任务 → 轮询 /api/v1/tasks/{id} → 取回图片。
 * 官方 compatible-mode 并不提供 /images/generations（实测 404）。
 *
 * 带参考图时改走「万相-通用图像编辑」：同样是异步任务，
 * base_image_url 直接吃 data URL（官方文档：支持 Base64 编码数据）。
 */
export async function generateQwenImage(
  config: AiConfig,
  input: ImageInput,
  options: QwenImageOptions = {},
): Promise<{ imageSrc: string }> {
  const { pollIntervalMs = 2000, maxPolls = 40 } = options;
  const origin = dashscopeOrigin(config.baseUrl);
  const prompt = buildPrompt(input.prompt, input.texts);

  // 图改图模型可以在设置里单独指定；留空就沿用老规矩：
  // 文生图模型（名字里带 t2i）不能做编辑，自动换成图像编辑模型。
  const configuredEditModel = (config.imageEditModel ?? '').trim();
  const editModel =
    configuredEditModel ||
    (/t2i|text2image/.test(config.imageModel) ? 'wanx2.1-imageedit' : config.imageModel);
  const withReference = input.images.length > 0;
  const path = withReference
    ? '/api/v1/services/aigc/image2image/image-synthesis'
    : '/api/v1/services/aigc/text2image/image-synthesis';
  const body = withReference
    ? {
        model: editModel,
        input: {
          function: 'description_edit',
          prompt: clampEditPrompt(input.prompt, input.texts),
          base_image_url: input.images[0].dataUrl,
        },
        parameters: { n: 1 },
      }
    : {
        model: config.imageModel,
        input: { prompt },
        parameters: { size: input.size, n: 1 },
      };

  const submit = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
  });

  if (!submit.ok) {
    throw new Error(`千问生图提交失败（${submit.status}）：${(await submit.text()).slice(0, 300)}`);
  }

  const submitted = (await submit.json()) as { output?: { task_id?: string; message?: string } };
  const taskId = submitted.output?.task_id;
  if (!taskId) {
    throw new Error(`千问生图未返回 task_id：${submitted.output?.message ?? '响应结构异常'}`);
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const statusResponse = await fetch(`${origin}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!statusResponse.ok) {
      throw new Error(`千问任务查询失败（${statusResponse.status}）：${(await statusResponse.text()).slice(0, 200)}`);
    }

    const task = (await statusResponse.json()) as {
      output?: { task_status?: string; message?: string; results?: { url?: string }[] };
    };
    const status = task.output?.task_status;

    if (status === 'SUCCEEDED') {
      const url = task.output?.results?.[0]?.url;
      if (!url) throw new Error('千问生图完成但没有返回图片地址');
      return { imageSrc: await inlineRemoteImage(url) };
    }
    if (status && status !== 'PENDING' && status !== 'RUNNING') {
      throw new Error(`千问生图失败：${task.output?.message ?? status}`);
    }
  }

  throw new Error('千问生图超时：任务仍在处理中，请稍后重试');
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
