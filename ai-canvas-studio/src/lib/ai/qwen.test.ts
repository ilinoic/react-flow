import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateQwenImage } from './provider';
import { PROVIDER_PRESETS } from './settings';

const qwenConfig = {
  provider: 'qwen' as const,
  baseUrl: PROVIDER_PRESETS.qwen.baseUrl,
  apiKey: 'sk-qwen',
  imageModel: PROVIDER_PRESETS.qwen.imageModel,
  textModel: PROVIDER_PRESETS.qwen.textModel,
  imageSize: PROVIDER_PRESETS.qwen.imageSize,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('generateQwenImage（千问原生异步接口）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('提交任务、轮询成功后把图片取回成 data URL', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (String(url).includes('/services/aigc/text2image/image-synthesis')) {
        return json({ output: { task_id: 'task-1', task_status: 'PENDING' } });
      }
      if (String(url).includes('/api/v1/tasks/task-1')) {
        return json({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example.com/a.png' }] } });
      }
      if (String(url) === 'https://cdn.example.com/a.png') {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected url ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateQwenImage(
      qwenConfig,
      { prompt: '一位男员工', texts: ['商务正装'], images: [], size: '1024*1024' },
      { pollIntervalMs: 1, maxPolls: 3 },
    );

    expect(calls[0]).toContain('/services/aigc/text2image/image-synthesis');
    const submitBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(submitBody.model).toBe('wanx2.1-t2i-turbo');
    expect(submitBody.input.prompt).toContain('一位男员工');
    expect(submitBody.input.prompt).toContain('商务正装');

    const submitHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(submitHeaders['X-DashScope-Async']).toBe('enable');
    expect(submitHeaders.Authorization).toBe('Bearer sk-qwen');

    expect(result.imageSrc.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('任务失败时抛出上游给的原因', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('image-synthesis')) return json({ output: { task_id: 'task-2' } });
      return json({ output: { task_status: 'FAILED', message: '模型未开通' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateQwenImage(qwenConfig, { prompt: '猫', texts: [], images: [], size: '1024*1024' }, { pollIntervalMs: 1, maxPolls: 2 }),
    ).rejects.toThrow('模型未开通');
  });

  it('超过轮询次数仍未完成时报超时', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('image-synthesis')) return json({ output: { task_id: 'task-3' } });
      return json({ output: { task_status: 'RUNNING' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateQwenImage(qwenConfig, { prompt: '猫', texts: [], images: [], size: '1024*1024' }, { pollIntervalMs: 1, maxPolls: 2 }),
    ).rejects.toThrow(/超时/);
  });

  it('带参考图时给出明确的中文说明', async () => {
    await expect(
      generateQwenImage(
        qwenConfig,
        { prompt: '改造', texts: [], images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }], size: '1024*1024' },
        { pollIntervalMs: 1, maxPolls: 1 },
      ),
    ).rejects.toThrow(/参考图/);
  });

  it('提交被拒绝时抛出上游错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 'InvalidApiKey', message: 'Incorrect API key provided' }, 401)),
    );

    await expect(
      generateQwenImage(qwenConfig, { prompt: '猫', texts: [], images: [], size: '1024*1024' }, { pollIntervalMs: 1, maxPolls: 1 }),
    ).rejects.toThrow(/401/);
  });
});
