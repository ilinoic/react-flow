import Link from 'next/link';
import { AiSettingsForm } from '@/components/ai/AiSettingsForm';

export default function SettingsPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-lg items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">AI 供应商设置</h1>
        <Link href="/canvas" className="text-sm text-gray-500 hover:text-gray-900">
          返回画布
        </Link>
      </div>
      <AiSettingsForm />
    </main>
  );
}
