import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

import { POST } from './route';

const validBody = {
  mode: 'image',
  nodeId: 'n1',
  prompt: '猫',
  references: { texts: [], images: [] },
  config: {
    provider: 'mock',
    baseUrl: '',
    apiKey: '',
    imageModel: 'm',
    textModel: 't',
    imageSize: '1024x1024',
  },
};

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/ai/generate', { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/ai/generate', () => {
  beforeEach(() => getUser.mockReset());

  it('未登录返回 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it('提示词为空返回 400', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const response = await POST(makeRequest({ ...validBody, prompt: '' }));
    expect(response.status).toBe(400);
  });

  it('请求体不是 JSON 时返回 400', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const response = await POST(
      new Request('http://localhost/api/ai/generate', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });

  it('模拟模式返回图片', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(200);
    expect(String((await response.json()).imageSrc)).toContain('data:image/svg+xml');
  });

  it('文本模式返回文本', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const response = await POST(makeRequest({ ...validBody, mode: 'text' }));
    expect(response.status).toBe(200);
    expect(String((await response.json()).text)).toContain('猫');
  });

  it('接受千问供应商的请求', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('image-synthesis')) {
        return new Response(JSON.stringify({ output: { task_id: 't9' } }), { status: 200 });
      }
      if (String(url) === 'https://cdn.example.com/q.png') {
        return new Response(new Uint8Array([7, 7]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response(
        JSON.stringify({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example.com/q.png' }] } }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      makeRequest({
        ...validBody,
        config: { ...validBody.config, provider: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', imageModel: 'wanx2.1-t2i-turbo' },
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    );
    expect(String((await response.json()).imageSrc)).toContain('base64,');
    vi.unstubAllGlobals();
  });

  it('上游失败时返回 502 与可读错误', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })));

    const response = await POST(
      makeRequest({
        ...validBody,
        config: { ...validBody.config, provider: 'openai-compatible', baseUrl: 'https://api.test/v1', apiKey: 'k' },
      }),
    );

    expect(response.status).toBe(502);
    expect(String((await response.json()).error)).toContain('401');
    vi.unstubAllGlobals();
  });
});
