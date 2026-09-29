import { z } from 'zod';
import type { AiConfig, AiProvider } from './types';

export const AI_SETTINGS_KEY = 'ai-canvas:settings';

export const DEFAULT_AI_SETTINGS: AiConfig = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  imageModel: 'gpt-image-1',
  imageEditModel: 'gpt-image-1',
  textModel: 'gpt-4o-mini',
  imageSize: '1024x1024',
};

export type ProviderPreset = {
  label: string;
  baseUrl: string;
  /** 文生图（从零画一张）用的模型。 */
  imageModel: string;
  /** 图改图（有底图/在已有结果上继续改）用的模型。 */
  imageEditModel: string;
  textModel: string;
  imageSize: string;
};

export const PROVIDER_PRESETS: Record<AiProvider, ProviderPreset> = {
  mock: {
    label: '模拟模式（不联网，出占位图）',
    baseUrl: 'https://api.openai.com/v1',
    imageModel: 'gpt-image-1',
    imageEditModel: 'gpt-image-1',
    textModel: 'gpt-4o-mini',
    imageSize: '1024x1024',
  },
  'openai-compatible': {
    label: 'OpenAI 兼容接口（自定义地址）',
    baseUrl: 'https://api.openai.com/v1',
    imageModel: 'gpt-image-1',
    imageEditModel: 'gpt-image-1',
    textModel: 'gpt-4o-mini',
    imageSize: '1024x1024',
  },
  qwen: {
    label: '通义千问 · 阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    // 2026-09 查过百炼的模型列表：qwen-image-3.0-pro / qwen-image-edit-max / qwen3.8-max
    // 是当时最新的三件套，这里跟着更新，别再回落到老的 wanx2.1 那一代。
    imageModel: 'qwen-image-3.0-pro',
    imageEditModel: 'qwen-image-edit-max',
    textModel: 'qwen3.8-max',
    imageSize: '1024*1024',
  },
};

const schema = z.object({
  provider: z.enum(['openai-compatible', 'mock', 'qwen']),
  baseUrl: z.string(),
  apiKey: z.string(),
  imageModel: z.string(),
  // 老配置里没有这一项：缺了就按「自动挑」处理，不要整份配置回落到默认值。
  imageEditModel: z.string().optional(),
  textModel: z.string(),
  imageSize: z.string(),
});

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedConfig: AiConfig = DEFAULT_AI_SETTINGS;

function parseSettings(raw: string | null): AiConfig {
  if (!raw) return DEFAULT_AI_SETTINGS;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_AI_SETTINGS;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function loadAiSettings(): AiConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_AI_SETTINGS;
  return parseSettings(localStorage.getItem(AI_SETTINGS_KEY));
}

export function saveAiSettings(config: AiConfig): void {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(config));
  cachedRaw = null;
  cachedConfig = config;
  listeners.forEach((listener) => listener());
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** useSyncExternalStore 需要返回稳定引用，因此这里做缓存。 */
export function getAiSettingsSnapshot(): AiConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_AI_SETTINGS;
  const raw = localStorage.getItem(AI_SETTINGS_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedConfig = parseSettings(raw);
  }
  return cachedConfig;
}

export function getAiSettingsServerSnapshot(): AiConfig {
  return DEFAULT_AI_SETTINGS;
}

export function isAiConfigured(config: AiConfig): boolean {
  if (config.provider === 'mock') return true;
  return (
    config.baseUrl.trim() !== '' &&
    config.apiKey.trim() !== '' &&
    config.imageModel.trim() !== ''
  );
}
