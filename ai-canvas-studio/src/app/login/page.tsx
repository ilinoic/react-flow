import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/AuthForm';

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Suspense fallback={<p className="text-sm text-gray-500">加载中…</p>}>
        <AuthForm mode="signin" />
      </Suspense>
    </main>
  );
}
