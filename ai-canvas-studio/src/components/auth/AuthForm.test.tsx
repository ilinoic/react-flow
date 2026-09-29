import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './AuthForm';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  replace: vi.fn(),
  search: 'next=/projects',
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      resend: mocks.resend,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

describe('AuthForm 的登录/注册互跳', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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

describe('AuthForm 不再提供邮箱链接登录', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('登录页没有「用邮箱链接登录」按钮', () => {
    render(<AuthForm mode="signin" />);
    expect(screen.queryByRole('button', { name: /邮箱链接/ })).toBeNull();
  });

  it('注册页没有「用邮箱链接注册」按钮', () => {
    render(<AuthForm mode="signup" />);
    expect(screen.queryByRole('button', { name: /邮箱链接/ })).toBeNull();
  });

  it('页面里没有验证码相关的输入框和按钮', () => {
    render(<AuthForm mode="signin" />);

    expect(screen.queryByLabelText('验证码')).toBeNull();
    expect(screen.queryByRole('button', { name: /验证码/ })).toBeNull();
  });
});

describe('AuthForm 的忘记密码入口', () => {
  it('登录页提供「忘记密码」入口，指向 /forgot-password', () => {
    render(<AuthForm mode="signin" />);
    expect(screen.getByRole('link', { name: /忘记密码/ })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('注册页不显示「忘记密码」入口', () => {
    render(<AuthForm mode="signup" />);
    expect(screen.queryByRole('link', { name: /忘记密码/ })).toBeNull();
  });
});

describe('AuthForm 的登录与注册提交', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.search = 'next=/projects';
  });

  it('登录成功后跳到 next 指向的页面', async () => {
    render(<AuthForm mode="signin" />);
    mocks.signInWithPassword.mockResolvedValue({ error: null });

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: '123456',
    });
    expect(mocks.replace).toHaveBeenCalledWith('/projects');
  });

  it('登录失败时把「邮箱或密码不对」翻成中文并给出下一步', async () => {
    render(<AuthForm mode="signin" />);
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/邮箱或密码对不上/);
    expect(status).toHaveTextContent(/忘记密码/);
  });
});

describe('邮件链接失效时的提示', () => {
  it('带着 error=confirm 回到登录页时给出说明', () => {
    mocks.search = 'error=confirm';
    render(<AuthForm mode="signin" />);

    expect(screen.getByRole('status')).toHaveTextContent(/链接已失效或已使用/);

    mocks.search = 'next=/projects';
  });
});

describe('确认邮件的重发入口', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.search = 'next=/projects';
  });

  it('登录提示「邮箱未确认」时给出重发按钮，点了就重新发确认邮件', async () => {
    render(<AuthForm mode="signin" />);
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@outlook.com');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(screen.getByRole('status')).toHaveTextContent(/邮箱还没确认/);

    mocks.resend.mockResolvedValue({ error: null });
    await userEvent.click(screen.getByRole('button', { name: '重新发送确认邮件' }));

    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'me@outlook.com',
      options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
    });
    await expect(screen.findByRole('status')).resolves.toHaveTextContent(/已重新发送/);
  });

  it('别的登录错误不给重发按钮', async () => {
    render(<AuthForm mode="signin" />);
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@outlook.com');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(screen.queryByRole('button', { name: '重新发送确认邮件' })).toBeNull();
  });

  it('邮件发送被限流时翻成中文提示', async () => {
    render(<AuthForm mode="signup" />);
    mocks.signUp.mockResolvedValue({ data: {}, error: { message: 'Email rate limit exceeded' } });

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@outlook.com');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(screen.getByRole('status')).toHaveTextContent(/邮件发送太频繁/);
  });
});
