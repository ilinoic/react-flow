import { describe, expect, it } from 'vitest';
import { signInSchema, signUpSchema } from './validation';

describe('signInSchema', () => {
  it('接受合法邮箱与密码', () => {
    expect(signInSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true);
  });

  it('拒绝非法邮箱', () => {
    expect(signInSchema.safeParse({ email: 'nope', password: '123456' }).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('密码少于 6 位时报错并给出中文提示', () => {
    const result = signUpSchema.safeParse({ email: 'a@b.com', password: '123' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('密码至少 6 位');
  });
});
