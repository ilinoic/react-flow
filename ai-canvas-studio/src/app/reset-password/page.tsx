import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Suspense fallback={<p className="text-sm text-gray-500">加载中…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
