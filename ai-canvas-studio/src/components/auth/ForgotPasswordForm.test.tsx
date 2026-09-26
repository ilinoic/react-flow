import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));

describe('忘记密码表单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it('填邮箱提交后发重置邮件，回跳地址指向重置页', async () => {
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: '发送重置链接' }));

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('me@example.com', {
      redirectTo: expect.stringContaining('/auth/callback?next=%2Freset-password'),
    });
    expect(screen.getByRole('status')).toHaveTextContent(/邮件已发送/);
  });

  it('邮箱格式不对就不发请求', async () => {
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText('邮箱'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: '发送重置链接' }));

    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/邮箱格式不正确/);
  });

  it('发信失败时把上游原因显示出来', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: '发送重置链接' }));

    expect(screen.getByRole('status')).toHaveTextContent('Email rate limit exceeded');
  });

  it('提供回登录页的入口', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole('link', { name: /返回登录/ })).toHaveAttribute('href', '/login');
  });
});
