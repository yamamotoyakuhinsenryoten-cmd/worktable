"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = "not_started" | "in_progress" | "completed";
type Ticket = { id: number; title: string; content: string; status: Status; created_at: string; updated_at: string };
const labels: Record<Status, string> = { not_started: "未着手", in_progress: "進行中", completed: "完了" };

async function responseError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data.error ?? "処理に失敗しました。もう一度お試しください。";
}

export default function Todos() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/todos").then(async response => {
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json();
      setTickets(data.tickets);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "チケットの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const selected = tickets.find(ticket => ticket.id === selectedId) ?? null;
  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content }) });
      if (!response.ok) throw new Error(await responseError(response));
      const { ticket } = await response.json() as { ticket: Ticket };
      setTickets(current => [ticket, ...current]); setSelectedId(ticket.id); setEditing(false);
      setTitle(""); setContent(""); setModalOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "チケットの作成に失敗しました"); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/todos/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: draftTitle, content: draftContent }) });
      if (!response.ok) throw new Error(await responseError(response));
      const { ticket } = await response.json() as { ticket: Ticket };
      setTickets(current => current.map(item => item.id === ticket.id ? ticket : item)); setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存に失敗しました"); }
    finally { setSaving(false); }
  };

  const updateStatus = async (status: Status) => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/todos/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error(await responseError(response));
      const { ticket } = await response.json() as { ticket: Ticket };
      setTickets(current => current.map(item => item.id === ticket.id ? ticket : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ステータスの保存に失敗しました"); }
    finally { setSaving(false); }
  };

  const beginEdit = () => { if (!selected) return; setDraftTitle(selected.title); setDraftContent(selected.content); setEditing(true); };

  const ticketItems = () => loading
    ? <p className="p-4 text-sm text-zinc-500">読み込み中…</p>
    : tickets.length === 0
      ? <p className="p-4 text-sm text-zinc-500">チケットはまだありません。</p>
      : tickets.map(ticket => <button key={ticket.id} onClick={() => { setSelectedId(ticket.id); setEditing(false); setError(""); setDrawerOpen(false); }} className={`mb-1 w-full rounded-lg p-3 text-left ${ticket.id === selectedId ? "bg-zinc-100" : "hover:bg-zinc-50"}`}><span className="block truncate text-sm font-medium">{ticket.title}</span><span className="mt-1 block text-xs text-zinc-500">{labels[ticket.status]}</span></button>);

  return <main className="flex h-dvh flex-col bg-zinc-100 text-zinc-900">
    <header className="flex h-14 shrink-0 items-center border-b border-zinc-200 bg-white px-4">
      <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-950">← チャット</Link>
    </header>
    {error && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="relative flex min-h-0 flex-1">
      <aside className="hidden w-80 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex justify-end p-3">
          <button onClick={() => { setError(""); setModalOpen(true); }} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">＋ 追加</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{ticketItems()}</div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-white">
        <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-200 px-4 py-2 md:px-6">
          <button onClick={() => setDrawerOpen(true)} aria-label="一覧を開く" className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 md:hidden">☰</button>
          {selected ? <>
            {editing ? <input aria-label="タイトル" value={draftTitle} onChange={e => setDraftTitle(e.target.value)} maxLength={300} className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-base font-semibold md:text-lg" /> : <h1 className="min-w-0 flex-1 truncate text-base font-semibold md:text-lg">{selected.title}</h1>}
            <label className="shrink-0 text-xs text-zinc-500 md:text-sm">ステータス<select aria-label="ステータス" value={selected.status} onChange={e => updateStatus(e.target.value as Status)} disabled={saving || editing} className="ml-2 max-w-32 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 disabled:opacity-60"><option value="not_started">未着手</option><option value="in_progress">進行中</option><option value="completed">完了</option></select></label>
          </> : <p className="flex-1 text-sm text-zinc-500">チケット未選択</p>}
        </div>
        {selected ? <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
          {editing ? <div className="mx-auto max-w-3xl"><label className="block text-sm font-medium">内容<textarea autoFocus value={draftContent} onChange={e => setDraftContent(e.target.value)} className="mt-2 min-h-48 w-full rounded-lg border border-zinc-300 p-3" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={saveEdit} disabled={saving || !draftTitle.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button><button onClick={() => setEditing(false)} disabled={saving} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm">キャンセル</button></div></div> : <article className="mx-auto max-w-3xl"><div className="whitespace-pre-wrap text-sm leading-7">{selected.content || <span className="text-zinc-400">内容はありません。</span>}</div><div className="mt-5 flex justify-end"><button onClick={beginEdit} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">編集</button></div></article>}
        </div> : <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">一覧からチケットを選択してください。</div>}
        {selected && saving && <div role="status" className="border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">保存中…</div>}
      </section>

      {drawerOpen && <div className="fixed inset-0 z-40 md:hidden">
        <button aria-label="一覧を閉じる" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/35" />
        <aside className="absolute inset-y-0 left-0 z-10 flex w-[min(85vw,20rem)] flex-col bg-white shadow-2xl animate-[drawer-in_180ms_ease-out]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
            <span className="text-sm font-medium">チケット一覧</span>
            <button onClick={() => setDrawerOpen(false)} aria-label="一覧を閉じる" className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100">×</button>
          </div>
          <div className="flex shrink-0 justify-end p-3"><button onClick={() => { setError(""); setModalOpen(true); setDrawerOpen(false); }} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">＋ 追加</button></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{ticketItems()}</div>
        </aside>
      </div>}
    </div>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={createTicket} role="dialog" aria-modal="true" aria-labelledby="new-ticket-title" className="w-full max-w-lg rounded-2xl bg-white shadow-xl"><div className="border-b border-zinc-200 px-5 py-4"><h2 id="new-ticket-title" className="font-semibold">チケットを追加</h2></div><div className="space-y-4 p-5"><label className="block text-sm font-medium">タイトル（必須）<input autoFocus required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-300 p-3" /></label><label className="block text-sm font-medium">内容<textarea value={content} onChange={e => setContent(e.target.value)} className="mt-2 min-h-32 w-full rounded-lg border border-zinc-300 p-3" /></label></div><div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm">キャンセル</button><button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></div></form></div>}
  </main>;
}
