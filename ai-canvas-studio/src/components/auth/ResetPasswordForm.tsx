'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/auth/validation';

/**
 * 设置新密码：用户从重置邮件里的链接进来，此时 /auth/callback 已经把链接换成会话，
 * 所以这里可以直接 updateUser 改密码；没有会话说明链接过期或已用过。
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const router = useRouter();
  const params = useSearchParams();

  const next = params.get('next') ?? '/canvas';

  useEffect(() => {
    let active = true;
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setHasSession(Boolean(data.session));
      })
      .catch(() => {
        if (active) setHasSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('密码已更新，正在进入工作台…');
    router.replace(next);
  }

  if (hasSession === null) {
    return <p className="text-sm text-gray-500">正在检查链接…</p>;
  }

  if (!hasSession) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-xl font-semibold">链接已失效</h1>
        <p className="text-sm text-gray-500">
          这个重置链接已经过期或使用过了，请重新发一封邮件。
        </p>
        <Link
          href="/forgot-password"
          className="w-full rounded bg-black px-3 py-2 text-center text-sm text-white"
        >
          重新申请重置链接
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">设置新密码</h1>
        <p className="text-sm text-gray-500">设置好后就可以用新密码登录了</p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        新密码
        <input
          aria-label="新密码"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 6 位"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        确认新密码
        <input
          aria-label="确认新密码"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="再输一次"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? '处理中…' : '保存新密码'}
      </button>

      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    </form>
  );
}
