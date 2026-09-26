'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { signInSchema, signUpSchema } from '@/lib/auth/validation';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const next = params.get('next') ?? '/canvas';
  const linkError = params.get('error')
    ? '链接已失效或已使用，请重新登录；忘记密码可以点下面的「忘记密码？」'
    : null;
  const notice = message ?? (mode === 'signin' ? linkError : null);
  const other = mode === 'signin'
    ? { hint: '还没有账号？', label: '去注册', href: `/signup?next=${encodeURIComponent(next)}` }
    : { hint: '已有账号？', label: '去登录', href: `/login?next=${encodeURIComponent(next)}` };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const schema = mode === 'signin' ? signInSchema : signUpSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace(next);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session) {
      router.replace(next);
      return;
    }
    setMessage('注册成功，请到邮箱点击确认链接后再登录');
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{mode === 'signin' ? '登录' : '注册'}</h1>
        <p className="text-sm text-gray-500">使用邮箱{message ? '' : '即可开始画布创作'}</p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        邮箱
        <input
          aria-label="邮箱"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        密码
        <input
          aria-label="密码"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 6 位"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      {mode === 'signin' && (
        <p className="-mt-2 text-right text-sm">
          <Link
            href="/forgot-password"
            className="text-gray-600 underline underline-offset-2"
          >
            忘记密码？
          </Link>
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
      </button>

      {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}

      <p className="text-center text-sm text-gray-500">
        {other.hint}
        <Link href={other.href} className="ml-1 text-gray-900 underline underline-offset-2">
          {other.label}
        </Link>
      </p>
    </form>
  );
}
