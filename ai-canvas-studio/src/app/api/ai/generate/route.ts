import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateImage, generateText } from '@/lib/ai/provider';

const configSchema = z.object({
  provider: z.enum(['openai-compatible', 'mock', 'qwen']),
  baseUrl: z.string(),
  apiKey: z.string(),
  imageModel: z.string(),
  // 设置里单独指定的图改图模型；漏了这一项会被 zod 直接过滤掉，
  // 前面填了也白填（曾经踩过）。
  imageEditModel: z.string().optional(),
  textModel: z.string(),
  imageSize: z.string(),
});

const bodySchema = z.object({
  mode: z.enum(['image', 'text']),
  nodeId: z.string().min(1),
  prompt: z.string().min(1, { message: '提示词不能为空' }),
  references: z.object({
    texts: z.array(z.string()),
    images: z.array(z.object({ name: z.string(), dataUrl: z.string() })),
  }),
  size: z.string().optional(),
  config: configSchema,
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '请求参数不正确' },
      { status: 400 },
    );
  }

  const body = parsed.data;

  try {
    if (body.mode === 'image') {
      const result = await generateImage(body.config, {
        prompt: body.prompt,
        texts: body.references.texts,
        images: body.references.images,
        size: body.size ?? body.config.imageSize,
      });
      return NextResponse.json(result);
    }

    const result = await generateText(body.config, {
      prompt: body.prompt,
      texts: body.references.texts,
      images: body.references.images,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 502 },
    );
  }
}
