'use client';

import { useMemo, useState } from 'react';
import { useCanvasStore } from '@/lib/canvas/store';
import { resolveReferences } from '@/lib/canvas/graph';
import { loadAiSettings } from '@/lib/ai/settings';
import { toDataUrl } from '@/lib/ai/image';
import type { AiMessage } from '@/lib/canvas/types';

function newMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function NodeAiPanel({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const node = nodes.find((item) => item.id === nodeId);
  const bundle = useMemo(() => resolveReferences(nodeId, nodes, edges), [nodeId, nodes, edges]);

  if (!node) return null;

  const mode = node.type === 'image' ? 'image' : 'text';
  const history = node.data.ai.messages;
  const referenceText = bundle.texts.map((item) => item.text).join('\n');
  const effectivePrompt = prompt.trim() || referenceText;
  const canGenerate = effectivePrompt.length > 0 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);

    const config = loadAiSettings();
    const userMessage: AiMessage = {
      id: newMessageId(),
      role: 'user',
      text: effectivePrompt,
      createdAt: new Date().toISOString(),
    };
    updateNodeData(nodeId, { ai: { messages: [...history, userMessage], status: 'running' } } as never);

    try {
      const images = await Promise.all(
        bundle.images.map(async (item) => ({ name: item.nodeId, dataUrl: await toDataUrl(item.src) })),
      );

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          nodeId,
          prompt: effectivePrompt,
          size: config.imageSize,
          config,
          references: { texts: bundle.texts.map((item) => item.text), images },
        }),
      });
      const json = (await response.json()) as { imageSrc?: string; text?: string; error?: string };
      if (!response.ok) throw new Error(json.error ?? '生成失败');

      const assistantMessage: AiMessage = {
        id: newMessageId(),
        role: 'assistant',
        text: json.text ?? effectivePrompt,
        imageSrc: json.imageSrc,
        createdAt: new Date().toISOString(),
      };
      const messages = [...history, userMessage, assistantMessage];

      updateNodeData(
        nodeId,
        mode === 'image'
          ? ({ src: json.imageSrc, ai: { messages, status: 'idle' } } as never)
          : ({ text: json.text, ai: { messages, status: 'idle' } } as never),
      );
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '生成失败';
      setError(message);
      updateNodeData(nodeId, { ai: { messages: history, status: 'error', error: message } } as never);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-dvh w-80 flex-col gap-3 border-l border-gray-200 bg-white p-3 shadow-xl">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">节点 AI</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭面板"
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          关闭
        </button>
      </header>

      <section>
        <h3 className="mb-1 text-xs font-medium text-gray-500">参考素材（来自连线）</h3>
        {bundle.sources.length === 0 ? (
          <p className="text-xs text-gray-400">暂无连线参考，可从其它节点拖线到此节点</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {bundle.texts.map((item) => (
              <li key={item.nodeId} data-node-id={item.nodeId} className="rounded bg-gray-50 p-1 text-gray-700">
                {item.text}
              </li>
            ))}
            {bundle.images.map((item) => (
              <li key={item.nodeId} data-node-id={item.nodeId} className="rounded bg-gray-50 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt={item.alt} className="h-16 w-16 object-cover" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex-1 overflow-y-auto">
        <h3 className="mb-1 text-xs font-medium text-gray-500">本节点对话</h3>
        {history.length === 0 ? (
          <p className="text-xs text-gray-400">还没有对话记录</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {history.map((message) => (
              <li key={message.id} className={message.role === 'user' ? 'text-gray-900' : 'text-indigo-700'}>
                <span className="mr-1 font-medium">{message.role === 'user' ? '我' : 'AI'}：</span>
                {message.text}
                {message.imageSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={message.imageSrc} alt="生成结果" className="mt-1 h-24 w-24 object-cover" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <textarea
        aria-label="提示词"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="描述你想生成的内容；留空则使用连线上文本节点的内容"
        className="h-20 w-full resize-none rounded border border-gray-300 p-2 text-sm"
      />

      {!canGenerate && !busy && (
        <p className="text-xs text-gray-400">请输入提示词，或连接一个文本节点作为参考</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canGenerate}
        onClick={submit}
        className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
      >
        {busy ? '生成中…' : '生成'}
      </button>
    </aside>
  );
}
