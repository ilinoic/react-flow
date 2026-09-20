import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiSettingsForm } from './AiSettingsForm';
import { AI_SETTINGS_KEY } from '@/lib/ai/settings';

describe('AiSettingsForm', () => {
  beforeEach(() => localStorage.clear());

  it('填入 API Key 时自动切到"OpenAI 兼容接口"', async () => {
    render(<AiSettingsForm />);

    expect((screen.getByLabelText('供应商') as HTMLSelectElement).value).toBe('mock');

    await userEvent.type(screen.getByLabelText('API Key'), 'sk-test');

    expect((screen.getByLabelText('供应商') as HTMLSelectElement).value).toBe('openai-compatible');
  });

  it('保存后写入本地存储', async () => {
    render(<AiSettingsForm />);

    await userEvent.clear(screen.getByLabelText('Base URL'));
    await userEvent.type(screen.getByLabelText('Base URL'), 'https://api.example.com/v1');
    await userEvent.type(screen.getByLabelText('API Key'), 'sk-abc');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    const saved = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)!);
    expect(saved.provider).toBe('openai-compatible');
    expect(saved.baseUrl).toBe('https://api.example.com/v1');
    expect(saved.apiKey).toBe('sk-abc');
    await expect(screen.findByText('已保存到本机浏览器')).resolves.toBeTruthy();
  });

  it('选择通义千问会自动填好官方地址与模型名，并保留已填的 Key', async () => {
    render(<AiSettingsForm />);

    await userEvent.type(screen.getByLabelText('API Key'), 'sk-abc');
    await userEvent.selectOptions(screen.getByLabelText('供应商'), 'qwen');

    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
    expect((screen.getByLabelText('文本模型') as HTMLInputElement).value).toMatch(/^qwen/);
    expect((screen.getByLabelText('图片模型') as HTMLInputElement).value).toMatch(/^wanx/);
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('sk-abc');
  });
});
