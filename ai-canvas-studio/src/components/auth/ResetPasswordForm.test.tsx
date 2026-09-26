import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from './ResetPasswordForm';

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { updateUser: mocks.updateUser, getSession: mocks.getSession },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('next=/canvas'),
}));

async function fillForm(password: string, confirm: string) {
  const passwordInput = await screen.findByLabelText('新密码');
  await userEvent.type(passwordInput, password);
  if (confirm) await userEvent.type(screen.getByLabelText('确认新密码'), confirm);
}

describe('设置新密码表单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it('两次密码不一致时提示，且不发请求', async () => {
    render(<ResetPasswordForm />);
    await fillForm('123456', '654321');

    await userEvent.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/两次输入的密码不一致/);
  });

  it('密码太短时提示，且不发请求', async () => {
    render(<ResetPasswordForm />);
    await fillForm('123', '123');

    await userEvent.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/密码至少 6 位/);
  });

  it('保存成功后更新密码并跳到 next', async () => {
    render(<ResetPasswordForm />);
    await fillForm('newpass123', 'newpass123');

    await userEvent.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
    expect(screen.getByRole('status')).toHaveTextContent(/密码已更新/);
    expect(mocks.replace).toHaveBeenCalledWith('/canvas');
  });

  it('更新失败时把上游原因显示出来', async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: 'New password should be different' } });
    render(<ResetPasswordForm />);
    await fillForm('newpass123', 'newpass123');

    await userEvent.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(screen.getByRole('status')).toHaveTextContent('New password should be different');
  });

  it('链接失效（没有会话）时给出重新申请的入口，不显示表单', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    render(<ResetPasswordForm />);

    expect(await screen.findByRole('link', { name: /重新申请/ })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByLabelText('新密码')).toBeNull();
  });
});
