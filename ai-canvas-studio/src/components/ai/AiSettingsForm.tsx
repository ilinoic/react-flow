'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_AI_SETTINGS,
  PROVIDER_PRESETS,
  getAiSettingsServerSnapshot,
  getAiSettingsSnapshot,
  saveAiSettings,
  subscribeAiSettings,
} from '@/lib/ai/settings';
import type { AiConfig, AiProvider } from '@/lib/ai/types';

const FIELDS: { key: keyof AiConfig; label: string; placeholder?: string; secret?: boolean }[] = [
  { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.openai.com/v1' },
  { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true },
  { key: 'imageModel', label: '图片模型', placeholder: 'gpt-image-2.5-flare' },
  {
    key: 'imageEditModel',
    label: '图改图模型',
    placeholder: '例如 gpt-image-2.5-sunburst（留空则按图片模型自动挑）',
  },
  { key: 'textModel', label: '文本模型', placeholder: 'gpt-6-luna' },
  { key: 'imageSize', label: '默认图片尺寸', placeholder: '1024x1024' },
];

/** 套用某个供应商的预设：地址、图片模型、图改图模型、文本模型、尺寸一起换，Key 保持不动。 */
function withPreset(config: AiConfig, provider: AiProvider): AiConfig {
  const preset = PROVIDER_PRESETS[provider];
  return {
    ...config,
    provider,
    baseUrl: preset.baseUrl,
    imageModel: preset.imageModel,
    imageEditModel: preset.imageEditModel,
    textModel: preset.textModel,
    imageSize: preset.imageSize,
  };
}

export function AiSettingsForm() {
  const stored = useSyncExternalStore(
    subscribeAiSettings,
    getAiSettingsSnapshot,
    getAiSettingsServerSnapshot,
  );
  const [draft, setDraft] = useState<AiConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [revealKey, setRevealKey] = useState(false);

  const config = draft ?? stored ?? DEFAULT_AI_SETTINGS;

  function update<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setDraft(() => {
      const next: AiConfig = { ...config, [key]: value };
      // 填了 Key 还停在模拟模式是最容易踩的坑：自动切到自定义接口。
      // 只在"模拟模式"下自动切换，不要顶掉用户已选的千问等预设。
      if (key === 'apiKey' && String(value).trim() !== '' && next.provider === 'mock') {
        next.provider = 'openai-compatible';
      }
      return next;
    });
  }

  function onSave() {
    saveAiSettings(config);
    setDraft(null);
    setStatus(
      config.apiKey.trim() === ''
        ? '已保存到本机浏览器，但还没填 API Key，生成仍会失败'
        : '已保存到本机浏览器',
    );
  }

  function onProviderChange(provider: AiProvider) {
    setDraft(() => withPreset(config, provider));
  }

  // 老版本存下来的模型名会一直留在表单里（预设只在「切换供应商」时才套用），
  // 所以给一个显式入口，一键换成当前预设里的最新模型名。
  function onApplyPreset() {
    setDraft(() => withPreset(config, config.provider));
    setStatus('已换成该供应商当前预设的地址与模型名，点「保存」后生效');
  }

  async function onTest() {
    setTesting(true);
    setStatus(null);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image',
          nodeId: 'settings-test',
          prompt: '连接测试',
          references: { texts: [], images: [] },
          config,
        }),
      });
      const json = (await response.json()) as { imageSrc?: string; error?: string };
      setStatus(response.ok && json.imageSrc ? '连接成功' : `连接失败：${json.error ?? response.status}`);
    } catch (error) {
      setStatus(error instanceof Error ? `连接失败：${error.message}` : '连接失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        供应商
        <div className="flex items-center gap-2">
          <select
            aria-label="供应商"
            value={config.provider}
            onChange={(event) => onProviderChange(event.target.value as AiProvider)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            {(Object.keys(PROVIDER_PRESETS) as AiProvider[]).map((key) => (
              <option key={key} value={key}>
                {PROVIDER_PRESETS[key].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onApplyPreset}
            className="shrink-0 rounded border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
          >
            套用最新预设
          </button>
        </div>
      </label>

      {FIELDS.map((field) => (
        <div key={field.key} className="flex flex-col gap-1 text-sm">
          {field.label}
          <div className="flex items-center gap-2">
            <input
              aria-label={field.label}
              type={field.secret && !revealKey ? 'password' : 'text'}
              value={String(config[field.key] ?? '')}
              placeholder={field.placeholder}
              onChange={(event) => update(field.key, event.target.value as AiConfig[typeof field.key])}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
            {field.secret && (
              <button
                type="button"
                onClick={() => setRevealKey((value) => !value)}
                className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                {revealKey ? '隐藏 Key' : '显示 Key'}
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
      </div>

      {status && (
        <p role="status" className="text-sm text-gray-700">
          {status}
        </p>
      )}
      <p className="text-xs text-gray-500">
        配置只保存在这台设备上的浏览器里，不会上传到服务器数据库；请求时随 HTTPS 转发给 AI 接口。
        未配置时自动使用模拟模式，画布功能可先跑通。
      </p>
    </div>
  );
}
