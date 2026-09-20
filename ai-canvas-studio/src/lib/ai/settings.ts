import { z } from 'zod';
import type { AiConfig } from './types';

export const AI_SETTINGS_KEY = 'ai-canvas:settings';

export const DEFAULT_AI_SETTINGS: AiConfig = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  imageModel: 'gpt-image-1',
  textModel: 'gpt-4o-mini',
  imageSize: '1024x1024',
};

const schema = z.object({
  provider: z.enum(['openai-compatible', 'mock']),
  baseUrl: z.string(),
  apiKey: z.string(),
  imageModel: z.string(),
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
