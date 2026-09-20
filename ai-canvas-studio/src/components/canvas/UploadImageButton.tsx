'use client';

export function UploadImageButton({
  busy,
  error,
  onPick,
}: {
  busy: boolean;
  error: string | null;
  onPick: (file: File) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-2">
      <label className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
        {busy ? '上传中…' : '点击上传图片'}
        <input
          type="file"
          accept="image/*"
          aria-label="上传图片文件"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPick(file);
            event.target.value = '';
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-center text-[11px] leading-tight text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
