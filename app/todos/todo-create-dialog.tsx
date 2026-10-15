"use client";

export type TodoCreateDialogProps = {
  title: string;
  content: string;
  saving: boolean;
  errorMessage?: string;
  noticeMessage?: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
};

export default function TodoCreateDialog({
  title,
  content,
  saving,
  errorMessage,
  noticeMessage,
  onTitleChange,
  onContentChange,
  onSubmit,
  onClose,
}: TodoCreateDialogProps) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
    <form onSubmit={event => { event.preventDefault(); void onSubmit(); }} role="dialog" aria-modal="true" aria-labelledby="new-ticket-title" className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
      <div className="border-b border-zinc-200 px-5 py-4"><h2 id="new-ticket-title" className="font-semibold">チケットを追加</h2></div>
      <div className="space-y-4 p-5">
        {noticeMessage && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{noticeMessage}</p>}
        {errorMessage && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{errorMessage}</p>}
        <label className="block text-sm font-medium">タイトル（必須）<input autoFocus required maxLength={300} value={title} onChange={event => onTitleChange(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-300 p-3" /></label>
        <label className="block text-sm font-medium">内容<textarea value={content} onChange={event => onContentChange(event.target.value)} className="mt-2 min-h-32 w-full rounded-lg border border-zinc-300 p-3" /></label>
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm">キャンセル</button>
        <button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "保存中…" : "登録"}</button>
      </div>
    </form>
  </div>;
}
