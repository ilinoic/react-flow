'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { emailField, signInSchema, signUpSchema } from '@/lib/auth/validation';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const next = params.get('next') ?? '/canvas';
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

  /**
   * 邮箱链接（魔法链接）：Supabase 默认邮件模板只带一条登录链接、不带 6 位验证码，
   * 所以这里就走「点链接登录」这一条路，注册和登录共用。
   */
  async function onEmailLink() {
    const parsed = emailField.safeParse(email);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(
      mode === 'signin'
        ? '登录链接已发送，请查收邮箱（收不到就看看垃圾箱），点开邮件里的链接即可直接登录'
        : '注册链接已发送，请查收邮箱（收不到就看看垃圾箱），点开邮件里的链接即可完成注册',
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
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

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
      </button>

      <button
        type="button"
        onClick={onEmailLink}
        disabled={busy}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
      >
        {mode === 'signin' ? '用邮箱链接登录' : '用邮箱链接注册'}
      </button>

      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}

      <p className="text-center text-sm text-gray-500">
        {other.hint}
        <Link href={other.href} className="ml-1 text-gray-900 underline underline-offset-2">
          {other.label}
        </Link>
      </p>
    </form>
  );
}
