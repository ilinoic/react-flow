import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateQwenImage } from './provider';
import { PROVIDER_PRESETS } from './settings';

/**
 * 老的 wanx 配置：预设已经换成 qwen-image 那代了，但用户浏览器里存着的老配置
 * 还得继续走「提交任务 + 轮询」那条路，所以这里显式钉住老模型来测。
 */
const legacyQwenConfig = {
  provider: 'qwen' as const,
  baseUrl: PROVIDER_PRESETS.qwen.baseUrl,
  apiKey: 'sk-qwen',
  imageModel: 'wanx2.1-t2i-turbo',
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
      legacyQwenConfig,
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
      generateQwenImage(legacyQwenConfig, { prompt: '猫', texts: [], images: [], size: '1024*1024' }, { pollIntervalMs: 1, maxPolls: 2 }),
    ).rejects.toThrow('模型未开通');
  });

  it('超过轮询次数仍未完成时报超时', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('image-synthesis')) return json({ output: { task_id: 'task-3' } });
      return json({ output: { task_status: 'RUNNING' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateQwenImage(legacyQwenConfig, { prompt: '猫', texts: [], images: [], size: '1024*1024' }, { pollIntervalMs: 1, maxPolls: 2 }),
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
      legacyQwenConfig,
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
      { ...legacyQwenConfig, imageModel: 'wanx2.1-imageedit' },
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
      { ...legacyQwenConfig, imageEditModel: 'my-gateway-edit-model' },
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
      legacyQwenConfig,
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
      generateQwenImage(legacyQwenConfig, { prompt: '猫', texts: [], images: [], size: '1024*1024' }, { pollIntervalMs: 1, maxPolls: 1 }),
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

    // 1900 字以上上游会直接内部报错（实测），所以这里必须发短一些
    const longScript = '按这段剧本画分镜。'.repeat(400);
    await expect(
      generateQwenImage(
        legacyQwenConfig,
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
    expect(prompt.length).toBe(1800);
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
        legacyQwenConfig,
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

  it('图片模型是 qwen-image 时改走多模态同步接口，不再提交任务轮询', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (String(url).includes('multimodal-generation')) {
        return json({
          output: { choices: [{ message: { content: [{ image: 'https://cdn.example.com/m.png' }] } }] },
        });
      }
      if (String(url) === 'https://cdn.example.com/m.png') {
        return new Response(new Uint8Array([3, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected url ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateQwenImage(
      { ...legacyQwenConfig, imageModel: 'qwen-image-3.0' },
      { prompt: '一只橘猫', texts: [], images: [], size: '1024*1024' },
      { pollIntervalMs: 1, maxPolls: 2 },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/services/aigc/multimodal-generation/generation');
    expect(calls.some((url) => url.includes('/api/v1/tasks/'))).toBe(false);

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe('qwen-image-3.0');
    expect(body.input.messages[0].content[0].text).toContain('一只橘猫');
    expect(body.parameters.prompt_extend).toBe(true);
    expect(body.parameters.size).toBe('1024*1024');
    expect(result.imageSrc.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('多模态接口带底图时把图片和指令一起发出去，用设置里的图改图模型', async () => {
    let submitted: { model?: string; input?: { messages: { content: { image?: string; text?: string }[] }[] } } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('multimodal-generation')) {
        submitted = JSON.parse(String(init?.body));
        return json({
          output: { choices: [{ message: { content: [{ image: 'https://cdn.example.com/e.png' }] } }] },
        });
      }
      return new Response(new Uint8Array([4, 4]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateQwenImage(
      { ...legacyQwenConfig, imageModel: 'qwen-image-3.0', imageEditModel: 'qwen-image-edit-plus' },
      {
        prompt: '把背景换成夜晚的星空',
        texts: [],
        images: [{ name: 'n1', dataUrl: 'data:image/png;base64,FIRST' }],
        size: '1024*1024',
      },
      { pollIntervalMs: 1, maxPolls: 2 },
    );

    const content = submitted.input!.messages[0].content;
    expect(submitted.model).toBe('qwen-image-edit-plus');
    expect(content[0].image).toBe('data:image/png;base64,FIRST');
    expect(content[1].text).toContain('把背景换成夜晚的星空');
  });

  it('多模态接口不截断长提示词（6000 字实测能过）', async () => {
    let submitted: { input?: { messages: { content: { text?: string }[] }[] } } = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('multimodal-generation')) {
        submitted = JSON.parse(String(init?.body));
        return json({
          output: { choices: [{ message: { content: [{ image: 'https://cdn.example.com/l.png' }] } }] },
        });
      }
      return new Response(new Uint8Array([5, 5]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const longScript = '按这段剧本画分镜。'.repeat(200); // 1800 字
    await generateQwenImage(
      { ...legacyQwenConfig, imageModel: 'qwen-image-3.0' },
      { prompt: '画出来', texts: [longScript], images: [], size: '1024*1024' },
      { pollIntervalMs: 1, maxPolls: 2 },
    );

    const sent = submitted.input!.messages[0].content[0].text as string;
    expect(sent).toContain(longScript);
  });

  it('大图也要内联成 data URL，别留成会过期的临时链接', async () => {
    const bigImage = new Uint8Array(5 * 1024 * 1024); // 5MB，1664² 出图的实际体积量级
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('multimodal-generation')) {
        return json({
          output: { choices: [{ message: { content: [{ image: 'https://cdn.example.com/big.png' }] } }] },
        });
      }
      return new Response(bigImage, { status: 200, headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateQwenImage(
      { ...legacyQwenConfig, imageModel: 'qwen-image-3.0' },
      { prompt: '一只猫', texts: [], images: [], size: '1664*1664' },
      { pollIntervalMs: 1, maxPolls: 2 },
    );

    expect(result.imageSrc.startsWith('data:image/png;base64,')).toBe(true);
  });
});

