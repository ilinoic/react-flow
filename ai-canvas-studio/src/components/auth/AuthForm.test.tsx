import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthForm } from './AuthForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('next=/projects'),
}));

describe('AuthForm 的登录/注册互跳', () => {
  beforeEach(() => localStorage.clear());

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
