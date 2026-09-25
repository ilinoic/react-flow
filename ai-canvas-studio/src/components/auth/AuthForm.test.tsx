import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './AuthForm';

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('next=/projects'),
}));

describe('AuthForm 的登录/注册互跳', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
  });

  it('登录页提供去注册的入口，并带上 next 参数', () => {
    render(<AuthForm mode="signin" />);
    expect(screen.getByRole('link', { name: '去注册' })).toHaveAttribute(
      'href',
      '/signup?next=%2Fprojects',
    );
  });

  it('注册页提供去登录的入口，并带上 next 参数', () => {
    render(<AuthForm mode="signup" />);
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute(
      'href',
      '/login?next=%2Fprojects',
    );
  });
});

describe('邮箱链接登录（魔法链接）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
  });

  async function requestLink(email = 'me@example.com', name = '用邮箱链接登录') {
    await userEvent.type(screen.getByLabelText('邮箱'), email);
    await userEvent.click(screen.getByRole('button', { name }));
  }

  it('填好邮箱点「用邮箱链接登录」会发信，并说明点开链接即可登录', async () => {
    render(<AuthForm mode="signin" />);

    await requestLink('reader@example.com');

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'reader@example.com',
      options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
    });
    expect(screen.getByRole('status')).toHaveTextContent(/点开邮件里的链接即可直接登录/);
  });

  it('邮箱没填就点会提示，不发请求', async () => {
    render(<AuthForm mode="signin" />);

    await userEvent.click(screen.getByRole('button', { name: '用邮箱链接登录' }));

    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/请输入邮箱/);
  });

  it('发信失败时把上游原因显示出来', async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });
    render(<AuthForm mode="signin" />);

    await requestLink();

    expect(screen.getByRole('status')).toHaveTextContent('Email rate limit exceeded');
  });

  it('注册页上的按钮文案是「用邮箱链接注册」', async () => {
    render(<AuthForm mode="signup" />);
    await requestLink('new@example.com', '用邮箱链接注册');
    expect(mocks.signInWithOtp).toHaveBeenCalled();
  });

  it('页面上不再有验证码相关的输入框和按钮', () => {
    render(<AuthForm mode="signin" />);

    expect(screen.queryByLabelText('验证码')).toBeNull();
    expect(screen.queryByRole('button', { name: /验证码/ })).toBeNull();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
