import { z } from 'zod';

export const emailField = z
  .string()
  .trim()
  .min(1, { message: '请输入邮箱' })
  .email({ message: '邮箱格式不正确' });

export const passwordField = z.string().min(6, { message: '密码至少 6 位' });

export const signInSchema = z.object({ email: emailField, password: passwordField });
export const signUpSchema = z.object({ email: emailField, password: passwordField });

export type AuthInput = z.infer<typeof signInSchema>;
