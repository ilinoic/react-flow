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
    expect((screen.getByLabelText('文本模型') as HTMLInputElement).value).toBe('qwen3.8-max');
    expect((screen.getByLabelText('图片模型') as HTMLInputElement).value).toBe(
      'qwen-image-3.0-pro',
    );
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('sk-abc');
  });

  it('API Key 默认隐藏，可切换成明文查看', async () => {
    render(<AiSettingsForm />);

    expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: '显示 Key' }));
    expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: '隐藏 Key' }));
    expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('password');
  });

  it('已经选好千问预设时，填 Key 不会把供应商顶回"OpenAI 兼容接口"', async () => {
    render(<AiSettingsForm />);

    await userEvent.selectOptions(screen.getByLabelText('供应商'), 'qwen');
    await userEvent.type(screen.getByLabelText('API Key'), 'sk-qwen');

    expect((screen.getByLabelText('供应商') as HTMLSelectElement).value).toBe('qwen');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
  });

  it('保存时如果 Key 是空的会提醒', async () => {
    render(<AiSettingsForm />);
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('status')).toHaveTextContent(/还没填 API Key/);
  });

  it('设置里有「图改图模型」这一格，填了能存下来', async () => {
    render(<AiSettingsForm />);

    await userEvent.clear(screen.getByLabelText('图改图模型'));
    await userEvent.type(screen.getByLabelText('图改图模型'), 'my-custom-edit-model');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)!).imageEditModel).toBe(
      'my-custom-edit-model',
    );
  });

  it('切到千问预设会自动填好图改图模型', async () => {
    render(<AiSettingsForm />);

    await userEvent.selectOptions(screen.getByLabelText('供应商'), 'qwen');

    expect((screen.getByLabelText('图改图模型') as HTMLInputElement).value).toBe(
      'qwen-image-3.0-pro',
    );
  });

  it('存着老模型名时，「套用最新预设」能一键换成当前预设', async () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-old',
        imageModel: 'gpt-image-1',
        imageEditModel: 'gpt-image-1',
        textModel: 'gpt-4o-mini',
        imageSize: '1024x1024',
      }),
    );
    render(<AiSettingsForm />);

    await userEvent.click(screen.getByRole('button', { name: '套用最新预设' }));

    expect((screen.getByLabelText('图片模型') as HTMLInputElement).value).toBe(
      'gpt-image-2.5-flare',
    );
    expect((screen.getByLabelText('图改图模型') as HTMLInputElement).value).toBe(
      'gpt-image-2.5-sunburst',
    );
    expect((screen.getByLabelText('文本模型') as HTMLInputElement).value).toBe('gpt-6-luna');
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('sk-old');
  });
});
