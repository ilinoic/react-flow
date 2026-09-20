'use client';

import { useState } from 'react';
import { useCanvasStore } from './store';
import { resolveReferences } from './graph';
import { loadAiSettings } from '@/lib/ai/settings';
import { toDataUrl } from '@/lib/ai/image';
import type { AiGenerateResponse } from '@/lib/ai/types';
import type { AiMessage } from './types';

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

  // 节点自带的参考图：普通节点放在 referenceSrc，参考图片节点本身就是参考素材。
  const ownReferenceSrc =
    node?.data.kind === 'reference'
      ? node.data.src
      : (node?.data.referenceSrc ?? null);
  const ownReferenceImages = ownReferenceSrc
    ? [{ nodeId, src: ownReferenceSrc, alt: '节点参考图' }]
    : [];
  const referenceImages = [...ownReferenceImages, ...bundle.images];

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
    const history = node.data.ai.messages;
    const userMessage: AiMessage = {
      id: newMessageId(),
      role: 'user',
      text: effectivePrompt,
      createdAt: new Date().toISOString(),
    };

    setBusy(true);
    setError(null);
    updateNodeData(nodeId, { ai: { messages: [...history, userMessage], status: 'running' } } as never);

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
          references: { texts: bundle.texts.map((item) => item.text), images },
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
      applyResult([...history, userMessage, assistantMessage], json.imageSrc, json.text);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '生成失败';
      setError(message);
      updateNodeData(nodeId, { ai: { messages: history, status: 'error', error: message } } as never);
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
    aiOpen,
    setAiOpen,
    effectivePrompt,
    canGenerate,
    busy,
    error,
    isMock,
    generate,
    summary: referenceSummary(bundle.texts.length, referenceImages.length),
  };
}
