'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useNodeGeneration } from '@/lib/canvas/useNodeGeneration';
import { toReferenceImageDataUrl } from '@/lib/canvas/referenceImage';

/** 节点底部的提示词输入区：就地输入、就地生成，结果写回本节点。 */
export function NodeAiPrompt({
  nodeId,
  showReferenceSlot = true,
}: {
  nodeId: string;
  /** 参考图片节点的参考图就在节点主体上，底部不再重复一格。 */
  showReferenceSlot?: boolean;
}) {
  const {
    prompt,
    setPrompt,
    canGenerate,
    busy,
    error,
    isMock,
    generate,
    summary,
    referenceSrc,
    setReferenceSrc,
  } = useNodeGeneration(nodeId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 中文输入法组词期间先把内容留在本地，组词结束再写进画布：
  // 否则每敲一个字母都写一次全局状态，组词会被打断，看起来就是「打不进字」。
  const composing = useRef(false);
  const [draft, setDraft] = useState(prompt);

  useEffect(() => {
    if (!composing.current) setDraft(prompt);
  }, [prompt]);

  async function pickReference(file: File) {
    setReferenceSrc(await toReferenceImageDataUrl(file));
  }

  return (
    <div
      data-testid="node-ai-prompt"
      className="nodrag nopan nowheel flex shrink-0 flex-col gap-1 border-t border-gray-200 bg-gray-50 p-1"
    >
      {showReferenceSlot && (
        <div className="flex items-center gap-1">
          {referenceSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceSrc}
                alt="参考图"
                className="h-8 w-8 rounded border border-gray-300 object-cover"
              />
              <button
                type="button"
                aria-label="移除参考图"
                onClick={() => setReferenceSrc(null)}
                className="text-[10px] text-gray-500 underline hover:text-gray-800"
              >
                移除
              </button>
            </>
          ) : (
            <label className="cursor-pointer rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100">
              ＋ 参考图
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                aria-label="上传参考图"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void pickReference(file);
                  event.target.value = '';
                }}
              />
            </label>
          )}
          {summary && <p className="text-[10px] leading-tight text-gray-500">{summary}</p>}
        </div>
      )}

      <textarea
        aria-label="提示词"
        value={draft}
        placeholder="输入提示词…"
        onChange={(event) => {
          setDraft(event.target.value);
          if (!composing.current) setPrompt(event.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setDraft(event.currentTarget.value);
          setPrompt(event.currentTarget.value);
        }}
        className="nowheel h-9 w-full resize-none rounded border border-gray-300 bg-white px-1.5 py-1 text-xs leading-4 text-gray-900 outline-none focus:border-gray-500"
      />

      {!showReferenceSlot && summary && (
        <p className="text-[10px] leading-tight text-gray-500">{summary}</p>
      )}

      {error && (
        <p role="alert" className="text-[10px] leading-tight text-red-600">
          {error}
        </p>
      )}

      {showReferenceSlot && referenceSrc && (
        <p className="text-[10px] leading-tight text-gray-400">参考图不会被生成结果覆盖</p>
      )}

      {isMock && (
        <p className="text-[10px] leading-tight text-amber-700">
          模拟模式：结果是占位图，
          <Link href="/settings" className="underline">
            去设置
          </Link>
        </p>
      )}

      <button
        type="button"
        disabled={!canGenerate}
        onClick={() => void generate()}
        className="h-7 rounded bg-black px-2 text-xs text-white disabled:opacity-40"
      >
        <span aria-hidden="true">✨</span> {busy ? '生成中…' : 'AI 生成'}
      </button>
    </div>
  );
}
