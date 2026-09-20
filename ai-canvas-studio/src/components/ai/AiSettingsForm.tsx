'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_AI_SETTINGS,
  getAiSettingsServerSnapshot,
  getAiSettingsSnapshot,
  saveAiSettings,
  subscribeAiSettings,
} from '@/lib/ai/settings';
import type { AiConfig } from '@/lib/ai/types';

const FIELDS: { key: keyof AiConfig; label: string; placeholder?: string; secret?: boolean }[] = [
  { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.openai.com/v1' },
  { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true },
  { key: 'imageModel', label: '图片模型', placeholder: 'gpt-image-1' },
  { key: 'textModel', label: '文本模型', placeholder: 'gpt-4o-mini' },
  { key: 'imageSize', label: '默认图片尺寸', placeholder: '1024x1024' },
];

export function AiSettingsForm() {
  const stored = useSyncExternalStore(
    subscribeAiSettings,
    getAiSettingsSnapshot,
    getAiSettingsServerSnapshot,
  );
  const [draft, setDraft] = useState<AiConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const config = draft ?? stored ?? DEFAULT_AI_SETTINGS;

  function update<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setDraft({ ...config, [key]: value });
  }

  function onSave() {
    saveAiSettings(config);
    setDraft(null);
    setStatus('已保存到本机浏览器');
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
        <select
          aria-label="供应商"
          value={config.provider}
          onChange={(event) => update('provider', event.target.value as AiConfig['provider'])}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="mock">模拟模式（不联网，返回占位图）</option>
          <option value="openai-compatible">OpenAI 兼容接口（自定义）</option>
        </select>
      </label>

      {FIELDS.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-sm">
          {field.label}
          <input
            aria-label={field.label}
            type={field.secret ? 'password' : 'text'}
            value={String(config[field.key] ?? '')}
            placeholder={field.placeholder}
            onChange={(event) => update(field.key, event.target.value as AiConfig[typeof field.key])}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
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
