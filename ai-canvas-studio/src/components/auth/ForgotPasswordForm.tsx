'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { emailField } from '@/lib/auth/validation';

/**
 * 忘记密码：给邮箱发一封重置邮件，邮件里的链接会先走 /auth/callback 换成会话，
 * 再跳到 /reset-password 让用户设置新密码。
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = emailField.safeParse(email);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('邮件已发送，请查收邮箱（收不到就看看垃圾箱），点开邮件里的链接即可设置新密码');
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">找回密码</h1>
        <p className="text-sm text-gray-500">输入注册邮箱，我们会给你发一封重置邮件的链接</p>
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

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? '处理中…' : '发送重置链接'}
      </button>

      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}

      <p className="text-center text-sm text-gray-500">
        <Link href="/login" className="ml-1 text-gray-900 underline underline-offset-2">
          返回登录
        </Link>
      </p>
    </form>
  );
}
