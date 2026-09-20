import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrompt, generateImage, generateText, mockImageDataUrl } from './provider';
import { DEFAULT_AI_SETTINGS } from './settings';

const mockConfig = { ...DEFAULT_AI_SETTINGS, provider: 'mock' as const };

const openAiConfig = {
  ...DEFAULT_AI_SETTINGS,
  provider: 'openai-compatible' as const,
  baseUrl: 'https://api.test/v1',
  apiKey: 'k',
  imageModel: 'm',
};

describe('buildPrompt', () => {
  it('把参考文本拼进提示词', () => {
    expect(buildPrompt('一只柴犬', ['水彩风格', '高细节'])).toBe(
      '一只柴犬\n\n参考信息：\n- 水彩风格\n- 高细节',
    );
  });

  it('没有参考文本时保持原样', () => {
    expect(buildPrompt('一只柴犬', [])).toBe('一只柴犬');
  });

  it('忽略空白参考文本', () => {
    expect(buildPrompt('猫', ['  '])).toBe('猫');
  });
});

describe('mock 模式', () => {
  it('返回可渲染的 svg data url', async () => {
    const { imageSrc } = await generateImage(mockConfig, {
      prompt: '猫',
      texts: [],
      images: [],
      size: '1024x1024',
    });
    expect(imageSrc.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(imageSrc)).toContain('猫');
  });

  it('同一输入生成稳定结果', () => {
    expect(mockImageDataUrl('x')).toBe(mockImageDataUrl('x'));
  });

  it('文本模式回显提示词', async () => {
    const { text } = await generateText(mockConfig, { prompt: '写一句', texts: ['参考'], images: [] });
    expect(text).toContain('写一句');
    expect(text).toContain('参考');
  });
});

describe('openai 兼容模式', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('无参考图时调用 /images/generations 并解析 b64_json', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'AAA' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { imageSrc } = await generateImage(openAiConfig, {
      prompt: '猫',
      texts: [],
      images: [],
      size: '1024x1024',
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/images/generations');
    expect(imageSrc).toBe('data:image/png;base64,AAA');
  });

  it('有参考图时改调 /images/edits', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'BBB' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await generateImage(openAiConfig, {
      prompt: '改造',
      texts: [],
      size: '1024x1024',
      images: [{ name: 'n1', dataUrl: 'data:image/png;base64,AAA' }],
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/images/edits');
  });

  it('上游非 2xx 时抛出带状态码的错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })));

    await expect(
      generateImage(openAiConfig, { prompt: '猫', texts: [], images: [], size: '1024x1024' }),
    ).rejects.toThrow(/401/);
  });

  it('上游返回里没有图片时抛出可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));

    await expect(
      generateImage(openAiConfig, { prompt: '猫', texts: [], images: [], size: '1024x1024' }),
    ).rejects.toThrow('AI 接口返回里没有图片数据');
  });

  it('文本模式调用 /chat/completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '结果' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { text } = await generateText(openAiConfig, { prompt: '写一句', texts: [], images: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/chat/completions');
    expect(text).toBe('结果');
  });

  it('千问供应商同样走 OpenAI 兼容的图片接口', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'QQQ' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { imageSrc } = await generateImage(
      { ...openAiConfig, provider: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', imageModel: 'wanx2.1-t2i-turbo' },
      { prompt: '一只猫', texts: [], images: [], size: '1024*1024' },
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations',
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe('wanx2.1-t2i-turbo');
    expect(imageSrc).toBe('data:image/png;base64,QQQ');
  });
});
