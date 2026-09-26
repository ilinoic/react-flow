import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './AuthForm';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  replace: vi.fn(),
  search: 'next=/projects',
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
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

  it('登录失败时把上游原因显示出来', async () => {
    render(<AuthForm mode="signin" />);
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    await userEvent.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(screen.getByRole('status')).toHaveTextContent('Invalid login credentials');
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
