import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_SETTINGS_KEY,
  DEFAULT_AI_SETTINGS,
  PROVIDER_PRESETS,
  isAiConfigured,
  loadAiSettings,
  saveAiSettings,
} from './settings';

describe('AI 设置读写', () => {
  beforeEach(() => localStorage.clear());

  it('没有配置时返回默认值', () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('保存后能读回', () => {
    saveAiSettings({
      ...DEFAULT_AI_SETTINGS,
      provider: 'openai-compatible',
      baseUrl: 'https://x.dev/v1',
      apiKey: 'k',
      imageModel: 'img',
    });
    const loaded = loadAiSettings();
    expect(loaded.baseUrl).toBe('https://x.dev/v1');
    expect(loaded.imageModel).toBe('img');
  });

  it('损坏的 JSON 回落到默认值', () => {
    localStorage.setItem(AI_SETTINGS_KEY, '{oops');
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('字段不完整时回落到默认值', () => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ provider: 'mock' }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('判断配置是否可直接使用', () => {
    expect(isAiConfigured(DEFAULT_AI_SETTINGS)).toBe(true);
    expect(
      isAiConfigured({ ...DEFAULT_AI_SETTINGS, provider: 'openai-compatible', apiKey: '' }),
    ).toBe(false);
  });

  it('内置通义千问预设：地址与模型名都给出', () => {
    const qwen = PROVIDER_PRESETS.qwen;
    expect(qwen.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(qwen.textModel).toMatch(/^qwen/);
    expect(qwen.imageModel).toMatch(/^wanx/);
    expect(qwen.label).toContain('千问');
  });

  it('千问预设给出图改图模型', () => {
    expect(PROVIDER_PRESETS.qwen.imageEditModel).toBe('wanx2.1-imageedit');
  });

  it('旧配置里没有图改图模型也能照常读出来', () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        provider: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-old',
        imageModel: 'wanx2.1-t2i-turbo',
        textModel: 'qwen-plus',
        imageSize: '1024*1024',
      }),
    );

    const loaded = loadAiSettings();
    expect(loaded.provider).toBe('qwen');
    expect(loaded.imageModel).toBe('wanx2.1-t2i-turbo');
    expect(loaded.imageEditModel ?? '').toBe('');
  });

  it('能读出用千问供应商保存的配置', () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, provider: 'qwen', ...PROVIDER_PRESETS.qwen, apiKey: 'sk-x' } as never);
    expect(loadAiSettings().provider).toBe('qwen');
  });
});
