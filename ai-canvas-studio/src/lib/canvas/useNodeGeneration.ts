'use client';

import { useState } from 'react';
import { useCanvasStore } from './store';
import { resolveReferences } from './graph';
import { loadAiSettings } from '@/lib/ai/settings';
import { toDataUrl } from '@/lib/ai/image';
import { IMAGE_EDIT_PROMPT_LIMIT, buildPrompt } from '@/lib/ai/provider';
import type { AiGenerateResponse } from '@/lib/ai/types';
import type { AiMessage, CanvasNodeData } from './types';

function newMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function referenceSummary(texts: number, images: number): string | null {
  if (texts + images === 0) return null;
  const parts: string[] = [];
  if (texts > 0) parts.push(`${texts} 个文本`);
  if (images > 0) parts.push(`${images} 张图`);
  return `参考：${parts.join('、')}`;
}

/** 同一张图只发一次：底图在最前面，后面的重复项丢掉。 */
function dedupeImages<T extends { src: string }>(images: T[]): T[] {
  return images.filter(
    (item, index) => images.findIndex((other) => other.src === item.src) === index,
  );
}

/** 节点当前放着的东西：文本节点看文字，出图节点看图片。 */
export function readCurrentResult(data: CanvasNodeData | undefined): {
  kind: 'text' | 'image';
  value: string;
} {
  if (!data) return { kind: 'image', value: '' };
  if (data.kind === 'text') return { kind: 'text', value: data.text.trim() };
  if (data.kind === 'image' || data.kind === 'reference') {
    return { kind: 'image', value: data.src ?? '' };
  }
  return { kind: 'image', value: '' };
}

/**
 * 节点自带的 AI 生成能力：提示词存在节点数据里，参考素材来自入边连线，
 * 生成结果直接写回本节点，不需要额外的对话框面板。
 */
export function useNodeGeneration(nodeId: string) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const node = nodes.find((item) => item.id === nodeId);
  const bundle = resolveReferences(nodeId, nodes, edges);

  const settings = loadAiSettings();
  const isMock = settings.provider === 'mock';
  const prompt = node?.data.prompt ?? '';
  const referenceText = bundle.texts.map((item) => item.text).join('\n');
  const effectivePrompt = prompt.trim() || referenceText;
  const canGenerate = Boolean(node) && effectivePrompt.length > 0 && !busy;

  // 节点现在放着的东西：出图节点看图片，文本节点看文字。
  // 再次生成默认就在它上面接着改，所以把它当作底图/底稿一起发出去。
  const { kind: currentResultKind, value: currentResult } = readCurrentResult(node?.data);
  const hasCurrentResult = currentResult.length > 0;
  const basedOnCurrent = node?.data.basedOnCurrent ?? true;
  const usesCurrentResult = basedOnCurrent && hasCurrentResult;

  // 节点自带的参考图：普通节点放在 referenceSrc，参考图片节点本身就是参考素材。
  const ownReferenceSrc =
    node?.data.kind === 'reference'
      ? node.data.src
      : (node?.data.referenceSrc ?? null);
  const ownReferenceImages = ownReferenceSrc
    ? [{ nodeId, src: ownReferenceSrc, alt: '节点参考图' }]
    : [];
  const plainReferenceImages = dedupeImages([...ownReferenceImages, ...bundle.images]);
  // 底图排在最前面：出图接口拿第一张当「要改的那张」，其余的只参与提示词。
  const baseImages =
    usesCurrentResult && currentResultKind === 'image'
      ? [{ nodeId, src: currentResult, alt: '当前结果' }]
      : [];
  const referenceImages = dedupeImages([...baseImages, ...plainReferenceImages]);
  const referenceTexts =
    usesCurrentResult && currentResultKind === 'text'
      ? [currentResult, ...bundle.texts.map((item) => item.text)]
      : bundle.texts.map((item) => item.text);
  // 改图接口吃不下太长的提示词（见 provider.ts 里的实测值），提前告诉用户会被截断，
  // 免得他以为「我明明把整段剧本连上去了」。
  const editPromptWillTruncate =
    settings.provider === 'qwen' &&
    usesCurrentResult &&
    currentResultKind === 'image' &&
    buildPrompt(effectivePrompt, referenceTexts).length > IMAGE_EDIT_PROMPT_LIMIT;

  function setPrompt(value: string) {
    // 打字不该占撤销历史，撤销只回退生成这类实质改动。
    updateNodeData(nodeId, { prompt: value } as never, { history: false });
  }

  function setReferenceSrc(value: string | null) {
    updateNodeData(nodeId, { referenceSrc: value } as never);
  }

  const aiOpen = node?.data.aiOpen ?? true;

  function setAiOpen(value: boolean) {
    updateNodeData(nodeId, { aiOpen: value } as never);
  }

  function setBasedOnCurrent(value: boolean) {
    updateNodeData(nodeId, { basedOnCurrent: value } as never);
  }

  /** 出图节点一律把结果写回自己，不再另外新建节点。 */
  function applyResult(aiMessages: AiMessage[], imageSrc?: string, text?: string) {
    const ai = { messages: aiMessages, status: 'idle' as const };

    if (node!.data.kind === 'reference') {
      updateNodeData(nodeId, { src: imageSrc ?? null, ai } as never);
      return;
    }

    updateNodeData(
      nodeId,
      (node!.data.kind === 'image'
        ? { src: imageSrc ?? null, ai }
        : { text: text ?? '', ai }) as never,
    );
  }

  async function generate() {
    if (!node || !canGenerate) return;

    const config = loadAiSettings();
    const outputKind = node.data.kind === 'text' ? 'text' : 'image';
    const userMessage: AiMessage = {
      id: newMessageId(),
      role: 'user',
      text: effectivePrompt,
      createdAt: new Date().toISOString(),
    };

    setBusy(true);
    setError(null);
    // 只留这一轮的记录：生成过的图不堆在草稿里，免得本地存储越攒越大。
    updateNodeData(nodeId, { ai: { messages: [userMessage], status: 'running' } } as never);

    try {
      const images = await Promise.all(
        referenceImages.map(async (item) => ({ name: item.nodeId, dataUrl: await toDataUrl(item.src) })),
      );

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: outputKind,
          nodeId,
          prompt: effectivePrompt,
          size: config.imageSize,
          config,
          references: { texts: referenceTexts, images },
        }),
      });
      const json = (await response.json()) as AiGenerateResponse;
      if (!response.ok) throw new Error(json.error ?? '生成失败');

      const assistantMessage: AiMessage = {
        id: newMessageId(),
        role: 'assistant',
        text: json.text ?? effectivePrompt,
        imageSrc: json.imageSrc,
        createdAt: new Date().toISOString(),
      };
      applyResult([userMessage, assistantMessage], json.imageSrc, json.text);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '生成失败';
      setError(message);
      updateNodeData(nodeId, { ai: { messages: [userMessage], status: 'error', error: message } } as never);
    } finally {
      setBusy(false);
    }
  }

  return {
    bundle,
    prompt,
    setPrompt,
    referenceSrc: ownReferenceSrc,
    setReferenceSrc,
    currentResultKind,
    hasCurrentResult,
    basedOnCurrent,
    setBasedOnCurrent,
    usesCurrentResult,
    editPromptWillTruncate,
    aiOpen,
    setAiOpen,
    effectivePrompt,
    canGenerate,
    busy,
    error,
    isMock,
    generate,
    summary: referenceSummary(bundle.texts.length, plainReferenceImages.length),
  };
}
