'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { emailField, signInSchema, signUpSchema } from '@/lib/auth/validation';

/**
 * Supabase 的报错是英文原文，直接显示出来用户看不懂，
 * 而这两条恰好是「注册收不到邮件」最常见的两个原因，所以翻成人话并给出下一步。
 */
function friendlyAuthError(raw: string): string {
  if (/rate limit|too many requests/i.test(raw)) {
    return '邮件发送太频繁了：默认邮箱服务每小时只允许几封，等一会儿再点一次';
  }
  if (/not confirmed/i.test(raw)) {
    return '邮箱还没确认：点邮件里的确认链接就能登录。没收到就点下面的「重新发送确认邮件」';
  }
  return raw;
}

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  // 只有「邮箱没确认」才值得给重发入口，别的报错重发也没用。
  const [canResend, setCanResend] = useState(false);
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
    setCanResend(false);
    const supabase = createSupabaseBrowserClient();

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) {
        setCanResend(/not confirmed/i.test(error.message));
        setMessage(friendlyAuthError(error.message));
        return;
      }
      router.replace(next);
      return;
    }

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo },
    });
    setBusy(false);
    if (error) {
      setMessage(friendlyAuthError(error.message));
      return;
    }
    if (data.session) {
      router.replace(next);
      return;
    }
    setMessage('注册成功，请到邮箱点确认链接后再登录（几分钟没收到就先看垃圾邮件，登录页可以重新发送）');
  }

  async function onResend() {
    const parsed = emailField.safeParse(email);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0].message);
      return;
    }

    setResending(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setResending(false);
    setMessage(
      error
        ? friendlyAuthError(error.message)
        : '确认邮件已重新发送，请查收（先看垃圾邮件，邮件可能要等一两分钟）',
    );
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

      {canResend && (
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 disabled:opacity-50"
        >
          {resending ? '发送中…' : '重新发送确认邮件'}
        </button>
      )}

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
