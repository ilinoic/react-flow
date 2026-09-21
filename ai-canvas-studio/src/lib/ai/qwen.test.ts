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

  it('带参考图时改走图像编辑接口，Base64 直接当 base_image_url', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (String(url).includes('/services/aigc/image2image/image-synthesis')) {
        return json({ output: { task_id: 'edit-1', task_status: 'PENDING' } });
      }
      if (String(url).includes('/api/v1/tasks/edit-1')) {
        return json({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example.com/out.png' }] } });
      }
      if (String(url) === 'https://cdn.example.com/out.png') {
        return new Response(new Uint8Array([9, 9]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected url ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateQwenImage(
      qwenConfig,
      {
        prompt: '把背景换成蓝色',
        texts: [],
        images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }],
        size: '1024*1024',
      },
      { pollIntervalMs: 1, maxPolls: 3 },
    );

    expect(calls[0]).toContain('/services/aigc/image2image/image-synthesis');
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    // 文生图模型不能做编辑，自动换成图像编辑模型
    expect(body.model).toBe('wanx2.1-imageedit');
    expect(body.input.function).toBe('description_edit');
    expect(body.input.base_image_url).toBe('data:image/png;base64,AAA');
    expect(body.input.prompt).toContain('把背景换成蓝色');
    expect(result.imageSrc.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('图片模型已经是图像编辑模型时沿用用户的选择', async () => {
    let submitted: { model?: string } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('image2image')) {
        submitted = JSON.parse(String(init?.body));
        return json({ output: { task_id: 'edit-2' } });
      }
      if (String(url).includes('/api/v1/tasks/edit-2')) {
        return json({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example.com/b.png' }] } });
      }
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateQwenImage(
      { ...qwenConfig, imageModel: 'wanx2.1-imageedit' },
      { prompt: '改成水彩', texts: [], images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }], size: '1024*1024' },
      { pollIntervalMs: 1, maxPolls: 3 },
    );

    expect(submitted.model).toBe('wanx2.1-imageedit');
  });

  it('设置里填了图改图模型就优先用它', async () => {
    let submitted: { model?: string } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('image2image')) {
        submitted = JSON.parse(String(init?.body));
        return json({ output: { task_id: 'edit-custom' } });
      }
      if (String(url).includes('/api/v1/tasks/edit-custom')) {
        return json({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example.com/d.png' }] } });
      }
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateQwenImage(
      { ...qwenConfig, imageEditModel: 'my-gateway-edit-model' },
      { prompt: '改成水彩', texts: [], images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }], size: '1024*1024' },
      { pollIntervalMs: 1, maxPolls: 3 },
    );

    expect(submitted.model).toBe('my-gateway-edit-model');
  });

  it('多张参考图时只把第一张作为编辑底图', async () => {
    let submitted: { input?: { base_image_url?: string } } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('image2image')) {
        submitted = JSON.parse(String(init?.body));
        return json({ output: { task_id: 'edit-3' } });
      }
      if (String(url).includes('/api/v1/tasks/edit-3')) {
        return json({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example.com/c.png' }] } });
      }
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateQwenImage(
      qwenConfig,
      {
        prompt: '合成',
        texts: [],
        images: [
          { name: 'n1', dataUrl: 'data:image/png;base64,FIRST' },
          { name: 'n2', dataUrl: 'data:image/png;base64,SECOND' },
        ],
        size: '1024*1024',
      },
      { pollIntervalMs: 1, maxPolls: 3 },
    );

    expect(submitted.input?.base_image_url).toBe('data:image/png;base64,FIRST');
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

  it('改图时提示词太长会被截短，用户自己写的那句指令要保住', async () => {
    let submitted: { input?: { prompt?: string } } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('image2image')) {
        submitted = JSON.parse(String(init?.body));
        return json({ output: { task_id: 'edit-long' } });
      }
      return json({ output: { task_status: 'FAILED', message: '停在这里就够' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 2500 字以上上游会直接内部报错（实测），所以这里必须发短一些
    const longScript = '按这段剧本画分镜。'.repeat(400);
    await expect(
      generateQwenImage(
        qwenConfig,
        {
          prompt: '继续生成并把字变清晰',
          texts: [longScript],
          images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }],
          size: '1024*1024',
        },
        { pollIntervalMs: 1, maxPolls: 1 },
      ),
    ).rejects.toThrow('停在这里就够');

    const prompt = submitted.input?.prompt ?? '';
    expect(prompt.startsWith('继续生成并把字变清晰')).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(1500);
    // 参考信息只带上了前面一段，没有整段塞进去
    expect(prompt).toContain('参考信息');
    expect(prompt).toContain('按这段剧本画分镜。');
    expect(prompt.includes(longScript)).toBe(false);
  });

  it('改图时提示词没超限就原样发出去', async () => {
    let submitted: { input?: { prompt?: string } } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('image2image')) {
        submitted = JSON.parse(String(init?.body));
        return json({ output: { task_id: 'edit-short' } });
      }
      return json({ output: { task_status: 'FAILED', message: '停在这里就够' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const script = '按这段剧本画分镜：女医生翻病例。';
    await expect(
      generateQwenImage(
        qwenConfig,
        {
          prompt: '继续生成并把字变清晰',
          texts: [script],
          images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }],
          size: '1024*1024',
        },
        { pollIntervalMs: 1, maxPolls: 1 },
      ),
    ).rejects.toThrow('停在这里就够');

    expect(submitted.input?.prompt).toContain('继续生成并把字变清晰');
    expect(submitted.input?.prompt).toContain(script);
  });
});
