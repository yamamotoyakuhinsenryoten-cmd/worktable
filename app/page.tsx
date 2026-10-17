"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import TodoCreateDialog from "@/app/todos/todo-create-dialog";
import { parseChatSources, type ChatSource } from "@/lib/chat-sources";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { CATEGORY_FIELDS, LOG_CATEGORIES, emptyLogDraft, type LogDraft, type LogType, type RelatedItem } from "@/lib/log-schema";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

type Session = {
  id: number;
  title: string;
  logType: "work" | "experience" | "development";
  slug: string;
  logGenerated: boolean;
  messages: Message[];
};

type CategoryResult = {
  sessionId: number;
  categoryIds: CategoryId[];
  status: "classified" | "unclassified" | "invalid_output" | "error";
};

function createTitle() {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function moveSessionToFront(sessions: Session[], sessionId: number) {
  const index = sessions.findIndex((session) => session.id === sessionId);

  if (index <= 0) return sessions;

  return [sessions[index], ...sessions.slice(0, index), ...sessions.slice(index + 1)];
}

function groupDetails<T extends { group: string }>(fields: T[]) {
  return fields.reduce<Record<string, T[]>>((groups, field) => {
    (groups[field.group] ??= []).push(field);
    return groups;
  }, {});
}

function ArrayEditor({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  return <fieldset className="mt-5"><legend className="mb-2 font-semibold">{title}</legend><div className="space-y-2">{items.map((item, index) => <div key={index} className="flex items-start gap-2"><textarea value={item} onChange={event => { const next = [...items]; next[index] = event.target.value; onChange(next); }} className="min-h-12 flex-1 rounded-lg border border-zinc-300 p-2 text-sm" /><button type="button" aria-label={`${title} ${index + 1}を削除`} onClick={() => onChange(items.filter((_, i) => i !== index))} className="rounded-lg border px-3 py-2 text-sm">削除</button></div>)}</div><button type="button" onClick={() => onChange([...items, ""])} className="mt-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm">項目を追加</button></fieldset>;
}

function RelatedEditor({ items, onChange }: { items: RelatedItem[]; onChange: (items: RelatedItem[]) => void }) {
  const update = (index: number, key: "title" | "url" | "slug" | "id", value: string) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } as RelatedItem : item));
  };
  const changeKind = (index: number, kind: RelatedItem["kind"]) => {
    const title = items[index]?.title ?? "";
    const replacement: RelatedItem = kind === "external"
      ? { kind, title, url: "" }
      : kind === "log"
        ? { kind, title, slug: "" }
        : { kind, title, id: "" };
    onChange(items.map((item, itemIndex) => itemIndex === index ? replacement : item));
  };
  return <fieldset className="mt-5"><legend className="mb-2 font-semibold">関連ログ・参考リンク</legend><div className="space-y-4">{items.map((item, index) => <div key={index} className="rounded-xl border border-zinc-200 p-3"><div className="mb-3 flex items-center justify-between gap-3"><label className="flex-1 text-sm">種類<select value={item.kind} onChange={event => changeKind(index, event.target.value as RelatedItem["kind"])} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2"><option value="external">参考リンク</option><option value="log">関連ログ</option><option value="backlog">Backlog</option></select></label><button type="button" aria-label={`関連項目 ${index + 1}を削除`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="mt-5 rounded-lg border px-3 py-2 text-sm">削除</button></div><label className="block text-sm">タイトル<input value={item.title} onChange={event => update(index, "title", event.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>{item.kind === "external" && <label className="mt-3 block text-sm">URL<input type="url" value={item.url} onChange={event => update(index, "url", event.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>}{item.kind === "log" && <label className="mt-3 block text-sm">slug<input value={item.slug} onChange={event => update(index, "slug", event.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>}{item.kind === "backlog" && <label className="mt-3 block text-sm">ID<input value={item.id} onChange={event => update(index, "id", event.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>}</div>)}</div><button type="button" onClick={() => onChange([...items, { kind: "external", title: "", url: "" }])} className="mt-3 rounded-lg border border-zinc-300 px-3 py-2 text-sm">関連項目を追加</button></fieldset>;
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [categoryResult, setCategoryResult] = useState<CategoryResult | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputBaseHeightRef = useRef<number | null>(null);
  const [editingTitleSessionId, setEditingTitleSessionId] = useState<
    number | null
  >(null);
  const [titleInput, setTitleInput] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [todoDraftingMessageId, setTodoDraftingMessageId] = useState<number | null>(null);
  const [todoDraft, setTodoDraft] = useState<{ title: string; content: string } | null>(null);
  const [todoDraftError, setTodoDraftError] = useState("");
  const [todoCreateError, setTodoCreateError] = useState("");
  const [isCreatingTodo, setIsCreatingTodo] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingLog, setIsGeneratingLog] = useState(false);
  const [logDraft, setLogDraft] = useState<LogDraft | null>(null);
  const [isRegisteringLog, setIsRegisteringLog] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [mediaMessage, setMediaMessage] = useState("");
  const [mediaTarget, setMediaTarget] = useState<{ slug: string; logType: LogType } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [contextMenuSessionId, setContextMenuSessionId] = useState<
    number | null
  >(null);
  const [inputMode, setInputMode] = useState<"talk" | "write">("talk");

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const titleLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    if (inputBaseHeightRef.current === null) {
      inputBaseHeightRef.current = textarea.getBoundingClientRect().height;
    }
    textarea.style.height = "auto";
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight);
    textarea.style.height = `${Math.max(inputBaseHeightRef.current, Math.min(textarea.scrollHeight, maxHeight))}px`;
  }, [input]);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<"bottom" | "assistant" | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCreateTodoFromMessage = async (message: Message, index: number) => {
    if (!activeSession || todoDraftingMessageId !== null) return;
    setTodoDraftingMessageId(message.id);
    const context = activeSession.messages.slice(Math.max(0, index - 3), Math.min(activeSession.messages.length, index + 4))
      .map(({ role, content }) => ({ role, content }));
    let draft = { title: message.content.trim().split(/\r?\n/u)[0].slice(0, 300) || "チャットから作成したTODO", content: message.content };
    let generationError = "";
    try {
      const response = await fetch("/api/todos/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: { role: message.role, content: message.content }, context }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.draft?.title !== "string" || typeof data.draft?.content !== "string") {
        throw new Error(data.error ?? "TODO案の生成に失敗しました");
      }
      draft = data.draft;
    } catch (error) {
      generationError = error instanceof Error ? error.message : "TODO案の生成に失敗しました";
    } finally {
      setTodoDraftingMessageId(null);
    }
    setTodoDraft(draft);
    setTodoDraftError(generationError);
    setTodoCreateError("");
  };

  const handleRegisterTodo = async () => {
    if (!todoDraft || isCreatingTodo) return;
    setIsCreatingTodo(true);
    setTodoCreateError("");
    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todoDraft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "チケットの作成に失敗しました");
      setTodoDraft(null);
      setTodoDraftError("");
      setTodoCreateError("");
    } catch (error) {
      setTodoCreateError(error instanceof Error ? error.message : "チケットの作成に失敗しました");
    } finally {
      setIsCreatingTodo(false);
    }
  };

  const handleCloseTodoDialog = () => {
    if (isCreatingTodo) return;
    setTodoDraft(null);
    setTodoDraftError("");
    setTodoCreateError("");
  };

  // 保存済みデータを読み込む
  // 保存済みセッションを読み込む
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await fetch("/api/sessions");

        if (!response.ok) {
          throw new Error("セッションの取得に失敗しました");
        }

        const data = await response.json();

        const loadedSessions: Session[] = data.sessions.map(
          (session: {
            id: number;
            title: string;
            log_type: "work" | "experience" | "development";
            slug: string;
            log_generated: boolean;
          }) => ({
            id: session.id,
            title: session.title,
            logType: session.log_type,
            slug: session.slug,
            logGenerated: session.log_generated,
            messages: [],
          }),
        );

        setSessions(loadedSessions);

      } catch (error) {
        console.error(error);
      }
    };

    loadSessions();
  }, []);

  // アクティブなセッションを取得
  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );

  // 選択したセッションのメッセージを読み込む
  useEffect(() => {
    if (activeSessionId === null) return;

    const loadMessages = async () => {
      try {
        const response = await fetch(
          `/api/sessions/${activeSessionId}/messages`,
        );

        if (!response.ok) {
          throw new Error("メッセージの取得に失敗しました");
        }

        const data = await response.json();

        const messages: Message[] = data.messages.map(
          (message: {
            id: number;
            role: "user" | "assistant";
            content: string;
            sources?: unknown;
          }) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            sources: parseChatSources(message.sources) ?? [],
          }),
        );

        setSessions((current) =>
          current.map((session) =>
            session.id === activeSessionId
              ? {
                  ...session,
                  messages,
                }
              : session,
          ),
        );
      } catch (error) {
        console.error(error);
      }
    };

    loadMessages();
  }, [activeSessionId]);

  //最新メッセージまで自動スクロール
  useEffect(() => {
    const mode = pendingScrollRef.current;

    if (!mode) return;

    const container = messagesContainerRef.current;

    if (!container) return;

    if (mode === "bottom") {
      container.scrollTop = container.scrollHeight;
    }

    if (mode === "assistant") {
      const assistant = latestAssistantRef.current;

      if (!assistant) return;

      container.scrollTop = assistant.offsetTop - container.offsetTop;
    }

    pendingScrollRef.current = null;
  }, [activeSession?.messages.length]);

  // 新しいセッションを作り、APIが返した情報を画面用の型にする
  const createSession = async (): Promise<Session> => {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: createTitle(),
        logType: "work",
        slug: "",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "セッションの作成に失敗しました");
    }

    const session: Session = {
      id: data.session.id,
      title: data.session.title,
      logType: data.session.log_type,
      slug: data.session.slug,
      logGenerated: data.session.log_generated,
      messages: [],
    };

    return session;
  };

  // 一覧操作では従来どおり、その場で新規セッションを作る
  const handleCreateSession = async () => {
    try {
      const session = await createSession();
      setSessions((current) => [session, ...current]);
      setActiveSessionId(session.id);
      setInput("");
    } catch (error) {
      console.error(error);
    }
  };

  // 初回メッセージの場合だけ、送信前にセッションを確保する
  const ensureSessionForMessage = async () => {
    if (activeSessionId !== null) return activeSessionId;

    const session = await createSession();
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    return session.id;
  };

  // ログ生成済みを切り替える
  const toggleLogGenerated = async (sessionId: number) => {
    const session = sessions.find((session) => session.id === sessionId);

    if (!session) return;

    const logGenerated = !session.logGenerated;

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          logGenerated,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "ログ生成状態の更新に失敗しました");
      }

      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                logGenerated: data.session.log_generated,
              }
            : session,
        ),
      );
    } catch (error) {
      console.error(error);
    }
  };
  // 送信する
  const handleSend = async () => {
    const content = input.trim();

    if (!content || isSending || isAskingAI) {
      return;
    }

    setIsSending(true);

    try {
      const sessionId = await ensureSessionForMessage();
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          content,
          role: "user",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "メッセージの保存に失敗しました");
      }

      setSessions((current) => {
        const updated = current.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }

          return {
            ...session,
            messages: [
              ...session.messages,
              {
                id: data.message.id,
                role: data.message.role,
                content: data.message.content,
              },
            ],
          };
        });

        return moveSessionToFront(updated, sessionId);
      });

      setInput("");
      pendingScrollRef.current = "bottom";
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  // AIに聞く
  const handleAskAI = async () => {
    const content = input.trim();

    if (!content || isAskingAI || isSending) return;

    setIsAskingAI(true);
    setCategoryResult(null);
    let messageSessionId: number | null = null;

    try {
      const sessionId = await ensureSessionForMessage();
      messageSessionId = sessionId;
      // ユーザーの発言をDBに保存
      const userResponse = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          content,
          role: "user",
        }),
      });

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error(userData.error ?? "メッセージの保存に失敗しました");
      }

      setInput("");

      const userMessage: Message = {
        id: userData.message.id,
        role: userData.message.role,
        content: userData.message.content,
      };

      // 画面にもユーザーの発言を追加
      setSessions((current) => {
        const updated = current.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }

          return {
            ...session,
            messages: [...session.messages, userMessage],
          };
        });

        return moveSessionToFront(updated, sessionId);
      });

      // AIに送る会話
      const currentMessages =
        sessions.find((session) => session.id === sessionId)?.messages ??
        [];

      const messagesForAI = [...currentMessages, userMessage];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messagesForAI,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "AIへの問い合わせに失敗しました");
      }

      const categoryIds = Array.isArray(data.categoryIds)
        ? data.categoryIds.filter((id: unknown): id is CategoryId =>
          typeof id === "string" && CATEGORIES.some((category) => category.id === id))
        : [];
      const status = ["classified", "unclassified", "invalid_output", "error"].includes(data.categoryClassification)
        ? data.categoryClassification as CategoryResult["status"]
        : categoryIds.length > 0 ? "classified" : "unclassified";
      setCategoryResult({ sessionId, categoryIds, status });

      // AIの返答をDBに保存
      const assistantResponse = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          content: data.content,
          role: "assistant",
          sources: parseChatSources(data.sources) ?? [],
        }),
      });

      const assistantData = await assistantResponse.json();

      if (!assistantResponse.ok) {
        throw new Error(assistantData.error ?? "AIの返答の保存に失敗しました");
      }

      const assistantMessage: Message = {
        id: assistantData.message.id,
        role: assistantData.message.role,
        content: assistantData.message.content,
        sources: parseChatSources(assistantData.message.sources) ?? [],
      };

      // 画面にもAIの返答を追加
      setSessions((current) => {
        const updated = current.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }

          return {
            ...session,
            messages: [...session.messages, assistantMessage],
          };
        });

        return moveSessionToFront(updated, sessionId);
      });
      pendingScrollRef.current = "assistant";
    } catch (error) {
      console.error(error);
      setCategoryResult(null);

      const errorMessage: Message = {
        id: Date.now(),
        role: "assistant",
        content: "AIへの問い合わせに失敗しました。",
      };

      setSessions((current) =>
        current.map((session) => {
          if (session.id !== messageSessionId) {
            return session;
          }

          return {
            ...session,
            messages: [...session.messages, errorMessage],
          };
        }),
      );
    } finally {
      setIsAskingAI(false);
    }
  };

  //ログ生成
  const handleGenerateLog = async () => {
    if (!activeSession || isGeneratingLog) return;

    setIsGeneratingLog(true);
    setLogDraft(null);
    setRegistrationMessage("");

    try {
      // まずログを生成
      const response = await fetch("/api/log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: activeSession.messages,
          logType: activeSession.logType,
          slug: activeSession.slug,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "ログの生成に失敗しました");
      }

      if (!data.draft || typeof data.draft !== "object") throw new Error("AIの応答にログデータがありません");

      // Sessionの最新状態をDBに保存
      const updateResponse = await fetch(`/api/sessions/${activeSession.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: activeSession.title,
          logType: activeSession.logType,
          slug: activeSession.slug,
          logGenerated: true,
        }),
      });

      const updateData = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateData.error ?? "セッションの保存に失敗しました");
      }

      // 画面側も更新
      setSessions((currentSessions) =>
        currentSessions.map((session) =>
          session.id === activeSession.id
            ? {
                ...session,
                logGenerated: true,
              }
            : session,
        ),
      );
      setLogDraft(data.draft as LogDraft);
    } catch (error) {
      console.error(error);

      setRegistrationMessage(error instanceof Error ? error.message : "ログの生成に失敗しました");
    } finally {
      setIsGeneratingLog(false);
    }
  };

  // ログをサイトに登録
  const handleRegisterLog = async () => {
    if (!logDraft || isRegisteringLog) return;

    setIsRegisteringLog(true);
    setRegistrationMessage("");

    try {
      const register = (overwrite: boolean) => fetch("/api/register-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: logDraft,
          overwrite,
        }),
      });

      let response = await register(false);
      let data = await response.json();
      if (response.status === 409 && data.conflict && window.confirm(`${logDraft.slug}.ts はすでに存在します。上書きしますか？`)) {
        response = await register(true);
        data = await response.json();
      } else if (response.status === 409 && data.conflict) {
        setRegistrationMessage("登録をキャンセルしました。");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "サイトへの登録に失敗しました");
      }

      setRegistrationMessage(`✓ サイトに登録しました：${data.file}`);
      setMediaTarget({ slug: logDraft.slug, logType: logDraft.type });
      setLogDraft(null);
    } catch (error) {
      setRegistrationMessage(
        error instanceof Error ? error.message : "サイトへの登録に失敗しました",
      );
    } finally {
      setIsRegisteringLog(false);
    }
  };

  // メディアを追加
  const handleAddMedia = async () => {
    const target = mediaTarget ?? (activeSession ? { slug: activeSession.slug, logType: activeSession.logType } : null);
    if (!target) return;

    setIsAddingMedia(true);
    setMediaMessage("");

    try {
      const response = await fetch("/api/add-log-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: target.slug,
          logType: target.logType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "メディアの追加に失敗しました");
      }

      setMediaMessage(`✓ ${data.media.length}件のメディアを追加しました`);
    } catch (error) {
      setMediaMessage(
        error instanceof Error ? error.message : "メディアの追加に失敗しました",
      );
    } finally {
      setIsAddingMedia(false);
    }
  };

  const updateDraft = (key: string, value: unknown) => setLogDraft(current => current ? { ...current, [key]: value } : current);
  const changeDraftType = (type: LogType) => {
    if (!logDraft || type === logDraft.type) return;
    const next = emptyLogDraft(type, LOG_CATEGORIES[type][0], logDraft.slug);
    setLogDraft({ ...next, createdAt: logDraft.createdAt, title: logDraft.title, related: logDraft.related });
  };
  const changeDraftCategory = (category: string) => {
    if (!logDraft) return;
    const next = emptyLogDraft(logDraft.type, category, logDraft.slug);
    setLogDraft({ ...next, createdAt: logDraft.createdAt, title: logDraft.title, related: logDraft.related });
  };

  // タイトル編集開始
  const startEditingTitle = (session: Session) => {
    setTitleInput(session.title);
    setEditingTitleSessionId(session.id);
  };

  const saveTitle = async () => {
    const title = titleInput.trim();

    if (!title || editingTitleSessionId === null) {
      setEditingTitleSessionId(null);
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${editingTitleSessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "タイトルの更新に失敗しました");
      }

      setSessions((current) =>
        current.map((session) =>
          session.id === editingTitleSessionId
            ? {
                ...session,
                title,
              }
            : session,
        ),
      );

      setEditingTitleSessionId(null);
    } catch (error) {
      console.error(error);
    }
  };

  // タイトル編集キャンセル
  const cancelEditingTitle = () => {
    setEditingTitleSessionId(null);
  };

  const clearTitleLongPress = () => {
    if (titleLongPressTimerRef.current) {
      clearTimeout(titleLongPressTimerRef.current);
      titleLongPressTimerRef.current = null;
    }
  };

  return (
    <main className="flex h-dvh bg-zinc-100 text-zinc-900">
      {/* 左：セッション一覧 */}
      <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="border-b border-zinc-200 p-4">
          <h1 className="text-lg font-semibold">Worktable</h1>
          <Link href="/todos" className="mt-2 block rounded-lg px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
            TODO一覧
          </Link>
        </div>

        <div className="p-3">
          <button
            onClick={handleCreateSession}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
          >
            ＋ 新しい作業
          </button>
        </div>

        <nav className="space-y-1 px-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                session.id === activeSessionId
                  ? "bg-zinc-100"
                  : "hover:bg-zinc-50"
              }`}
            >
              {editingTitleSessionId === session.id ? (
                <>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        saveTitle();
                      }

                      if (event.key === "Escape") {
                        cancelEditingTitle();
                      }
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500"
                  />

                  <button
                    type="button"
                    onClick={saveTitle}
                    className="shrink-0 text-zinc-500 hover:text-zinc-900"
                    title="保存"
                  >
                    ✓
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSessionId(session.id);
                      setEditingTitleSessionId(null);
                    }}
                    onDoubleClick={() => {
                      startEditingTitle(session);
                    }}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {session.title}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleLogGenerated(session.id)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      session.logGenerated
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {session.logGenerated ? "ログ生成済み" : "未生成"}
                  </button>
                </>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* 右：作業スペース */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* ヘッダー */}{" "}
        <header className="border-b border-zinc-200 bg-white px-4 py-3 md:px-6 md:py-4">
          {" "}
          <div className="flex items-center justify-between gap-3">
            {" "}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {" "}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="shrink-0 rounded-lg p-2 text-xl text-zinc-600 hover:bg-zinc-100 md:hidden"
                aria-label="メニューを開く"
              >
                {" "}
                ☰{" "}
              </button>{" "}
              {activeSession && editingTitleSessionId === activeSession.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveTitle();
                      if (event.key === "Escape") cancelEditingTitle();
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => setTitleInput("")}
                    aria-label="タイトル入力をクリア"
                    title="入力をクリア"
                    className="shrink-0 rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    onClick={saveTitle}
                    aria-label="タイトルを保存"
                    title="保存"
                    className="shrink-0 rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditingTitle}
                    aria-label="タイトル編集をキャンセル"
                    title="キャンセル"
                    className="shrink-0 rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    ↩
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onDoubleClick={() => activeSession && startEditingTitle(activeSession)}
                  onTouchStart={() => {
                    if (!activeSession) return;
                    titleLongPressTimerRef.current = setTimeout(() => {
                      startEditingTitle(activeSession);
                      titleLongPressTimerRef.current = null;
                    }, 500);
                  }}
                  onTouchEnd={clearTitleLongPress}
                  onTouchMove={clearTitleLongPress}
                  onTouchCancel={clearTitleLongPress}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                  aria-label={`タイトル: ${activeSession?.title ?? "作業"}。編集するには長押しまたはダブルクリック`}
                >
                  {activeSession?.title ?? "作業"}
                </button>
              )}{" "}
              {categoryResult?.sessionId === activeSessionId && (
                <span
                  aria-live="polite"
                  className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600"
                >
                  話題: {categoryResult.status === "error" || categoryResult.status === "invalid_output"
                    ? "判定エラー"
                    : categoryResult.categoryIds.length > 0
                    ? categoryResult.categoryIds
                      .map((id) => CATEGORIES.find(({ id: categoryId }) => categoryId === id)?.displayName)
                      .filter((name) => typeof name === "string")
                      .join("、") || "未判定"
                    : "未判定"}
                </span>
              )}{" "}
              {/* 話す／書く：タイトルの右側 */}{" "}
              <div className="flex shrink-0 rounded-lg bg-zinc-100 p-1">
                {" "}
                <button
                  type="button"
                  onClick={() => setInputMode("talk")}
                  className={`rounded-md px-3 py-1.5 text-xs ${inputMode === "talk" ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                >
                  {" "}
                  話す{" "}
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setInputMode("write")}
                  className={`rounded-md px-3 py-1.5 text-xs ${inputMode === "write" ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                >
                  {" "}
                  書く{" "}
                </button>{" "}
              </div>{" "}
              {/* type／slug：PCのみ表示 */}{" "}
              {activeSession && (
                <div className="hidden items-center gap-2 lg:flex">
                  {" "}
                  <select
                    value={activeSession.logType}
                    onChange={(event) => {
                      const logType = event.target.value as
                        | "work"
                        | "experience"
                        | "development";
                      setSessions((current) =>
                        current.map((session) =>
                          session.id === activeSessionId
                            ? { ...session, logType }
                            : session,
                        ),
                      );
                    }}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                  >
                    {" "}
                    <option value="work">work</option>{" "}
                    <option value="experience">experience</option>{" "}
                    <option value="development">development</option>{" "}
                  </select>{" "}
                  <input
                    value={activeSession.slug}
                    onChange={(event) => {
                      const slug = event.target.value;
                      setSessions((current) =>
                        current.map((session) =>
                          session.id === activeSessionId
                            ? { ...session, slug }
                            : session,
                        ),
                      );
                    }}
                    placeholder="slug"
                    className="w-48 rounded-md border border-zinc-300 px-3 py-1 text-sm outline-none focus:border-zinc-500"
                  />{" "}
                </div>
              )}{" "}
            </div>{" "}
            <button
              onClick={handleGenerateLog}
              disabled={
                isGeneratingLog ||
                !activeSession ||
                activeSession.messages.length === 0
              }
              className="hidden shrink-0 rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 md:block"
            >
              {" "}
              {isGeneratingLog ? "生成中…" : "ログを生成"}{" "}
            </button>{" "}
          </div>{" "}
          {registrationMessage && !logDraft && <p role="alert" className="mx-auto mt-2 max-w-3xl text-sm text-red-700">{registrationMessage}</p>}
          {mediaTarget && !logDraft && <div className="mx-auto mt-2 flex max-w-3xl items-center gap-3 text-sm"><button type="button" onClick={handleAddMedia} disabled={isAddingMedia} className="rounded-lg border border-zinc-300 px-3 py-2 disabled:opacity-50">{isAddingMedia ? "追加中…" : "メディアを追加"}</button>{mediaMessage && <span>{mediaMessage}</span>}</div>}
        </header>
        {/* メッセージ */}
        <div
          ref={messagesContainerRef}
          className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
        >
          <div className="mx-auto max-w-3xl space-y-4">
            {!activeSession || activeSession.messages.length === 0 ? (
              <div className="flex min-h-[400px] items-center justify-center text-center text-zinc-400">
                <div>
                  <p className="text-lg">ここに雑に置いていこう。</p>
                  <p className="mt-2 text-sm">
                    思いついたこと、作業メモ、疑問など。
                  </p>
                </div>
              </div>
            ) : (
              activeSession?.messages.map((message, index) => {
                const isLatestAssistant =
                  message.role === "assistant" &&
                  index === activeSession.messages.length - 1;

                return (
                  <div
                    key={message.id}
                    ref={isLatestAssistant ? latestAssistantRef : undefined}
                    className={`whitespace-pre-wrap rounded-xl p-3 text-sm shadow-sm ${
                      message.role === "assistant" ? "bg-zinc-200" : "bg-white"
                    }`}
                  >
                    {message.content}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 border-t border-zinc-300 pt-2">
                        <p className="mb-1 text-xs font-medium text-zinc-600">
                          参照したログ
                        </p>
                        <ul className="space-y-1">
                          {message.sources.map((source) => (
                            <li key={source.slug}>
                              <a
                                href={`https://mountain-book-dyeshop.vercel.app/logs/${encodeURIComponent(source.slug)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
                              >
                                {source.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-2 flex justify-end">
                      <button type="button" title="TODOを作成" aria-label={todoDraftingMessageId === message.id ? "TODOを生成中" : `${message.role === "user" ? "ユーザー" : "AI"}メッセージからTODOを作成`}
                        onClick={() => void handleCreateTodoFromMessage(message, index)}
                        disabled={todoDraftingMessageId !== null}
                        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-300/60 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 disabled:cursor-wait disabled:opacity-50"
                      ><svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg></button>
                    </div>
                  </div>
                );
              })
            )}
      {logDraft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 md:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="log-editor-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div><h2 id="log-editor-title" className="text-lg font-semibold">ログ内容の確認・編集</h2><p className="text-sm text-zinc-500">内容を確認してからサイトに登録できます。</p></div>
              <button type="button" onClick={() => { setLogDraft(null); setRegistrationMessage(""); }} className="rounded-lg px-3 py-2 text-sm hover:bg-zinc-100">閉じる</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">ログ種別<select value={logDraft.type} onChange={e => changeDraftType(e.target.value as LogType)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2">{(["work", "experience", "development"] as const).map(type => <option key={type}>{type}</option>)}</select></label>
                <label className="text-sm font-medium">カテゴリ<select value={logDraft.category} onChange={e => changeDraftCategory(e.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2">{LOG_CATEGORIES[logDraft.type].map(category => <option key={category}>{category}</option>)}</select></label>
                <label className="text-sm font-medium">slug<input value={logDraft.slug} onChange={e => updateDraft("slug", e.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>
                <label className="text-sm font-medium">作成日<input type="date" value={logDraft.createdAt} onChange={e => updateDraft("createdAt", e.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>
                <label className="text-sm font-medium sm:col-span-2">タイトル<input value={logDraft.title} onChange={e => updateDraft("title", e.target.value)} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" /></label>
              </div>
              {logDraft.type !== "development" && <div className="mt-6 space-y-5">{Object.entries(groupDetails(CATEGORY_FIELDS[logDraft.type][logDraft.category] ?? [])).map(([group, fields]) => <fieldset key={group}><legend className="mb-2 font-semibold">{group}</legend><div className="grid gap-3 sm:grid-cols-2">{fields.map(field => { const index = (logDraft.details ?? []).findIndex(item => item.label === field.label); const value = index >= 0 ? logDraft.details![index].value : ""; return <label key={field.label} className="text-sm">{field.label}{field.options && field.options.length <= 5 ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{["", ...field.options].map(option => <label key={option} className="inline-flex items-center gap-1"><input type="radio" name={`field-${field.label}`} checked={value === option} onChange={() => { const details = [...(logDraft.details ?? [])]; if (index >= 0) details[index] = { label: field.label, value: option }; else details.push({ label: field.label, value: option }); updateDraft("details", details); }} />{option || "未選択"}</label>)}</div> : field.options ? <select value={value} onChange={e => { const details = [...(logDraft.details ?? [])]; if (index >= 0) details[index] = { label: field.label, value: e.target.value }; else details.push({ label: field.label, value: e.target.value }); updateDraft("details", details); }} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2">{["", ...field.options].map(option => <option key={option}>{option}</option>)}</select> : <input value={value} onChange={e => { const details = [...(logDraft.details ?? [])]; if (index >= 0) details[index] = { label: field.label, value: e.target.value }; else details.push({ label: field.label, value: e.target.value }); updateDraft("details", details); }} className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" />}</label>; })}</div></fieldset>)}</div>}
              {logDraft.type === "work" && <><label className="mt-5 block text-sm">取り組み方<textarea value={logDraft.approach ?? ""} onChange={e => updateDraft("approach", e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-zinc-300 p-2" /></label><label className="mt-4 block text-sm">結果<textarea value={logDraft.result ?? ""} onChange={e => updateDraft("result", e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-zinc-300 p-2" /></label></>}
              {logDraft.type === "development" && <>{(["purpose", "policy", "result"] as const).map(key => <label key={key} className="mt-4 block text-sm">{({ purpose: "目的", policy: "方針", result: "結果" })[key]}<textarea value={String(logDraft[key] ?? "")} onChange={e => updateDraft(key, e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-zinc-300 p-2" /></label>)}</>}
              {(logDraft.type === "work" || logDraft.type === "experience") && <ArrayEditor title="気づき・考察" items={(logDraft.insights as string[]) ?? []} onChange={items => updateDraft("insights", items)} />}
              {(logDraft.type === "work" || logDraft.type === "development") && <ArrayEditor title="次にやること" items={(logDraft.next as string[]) ?? []} onChange={items => updateDraft("next", items)} />}
              {logDraft.type === "development" && <ArrayEditor title="手順" items={(logDraft.steps as string[]) ?? []} onChange={items => updateDraft("steps", items)} />}
              {logDraft.type === "development" && <ArrayEditor title="実行内容" items={(logDraft.execution as { title: string; body: string }[]).map(x => `${x.title}\n${x.body}`)} onChange={items => updateDraft("execution", items.map(item => { const [title = "", ...body] = item.split("\n"); return { title, body: body.join("\n") }; }))} />}
              <RelatedEditor items={logDraft.related} onChange={items => updateDraft("related", items)} />
              {registrationMessage && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{registrationMessage}</p>}
            </div>
            <footer className="flex justify-end gap-3 border-t border-zinc-200 px-5 py-4"><button type="button" onClick={() => { setLogDraft(null); setRegistrationMessage(""); }} disabled={isRegisteringLog} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm">破棄して閉じる</button><button type="button" onClick={handleRegisterLog} disabled={isRegisteringLog} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isRegisteringLog ? "登録中…" : "サイトに登録"}</button></footer>
          </section>
        </div>
      )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        {/* 入力 */}
        <div className="shrink-0 border-t border-zinc-200 bg-white p-3 md:p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  if (window.innerWidth < 768) {
                    return;
                  }

                  event.preventDefault();

                  if (inputMode === "talk") {
                    handleAskAI();
                  } else {
                    handleSend();
                  }
                }
              }}
              placeholder="ここに雑に書く……"
              disabled={isSending || isAskingAI}
              className="min-h-12 max-h-[10.5rem] w-full resize-none overflow-y-auto rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100 md:text-sm"
            />

            <div className="flex gap-2">
              <button
                onClick={inputMode === "talk" ? handleAskAI : handleSend}
                disabled={isSending || isAskingAI || !input.trim()}
                className="w-full rounded-xl bg-zinc-900 px-5 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isAskingAI || isSending ? "送信中…" : "送信"}
              </button>
            </div>
          </div>
        </div>
      </section>
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* 背景 */}
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 bg-black/30"
          />

          {/* サイドバー */}
          <aside className="relative z-10 flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-4">
              <div>
                <h1 className="text-lg font-semibold">Worktable</h1>
                <Link href="/todos" onClick={() => setIsSidebarOpen(false)} className="mt-2 inline-block rounded-lg px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                  TODO一覧
                </Link>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"
              >
                ×
              </button>
            </div>

            <div className="p-3">
              <button
                type="button"
                onClick={() => {
                  handleCreateSession();
                  setIsSidebarOpen(false);
                }}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white"
              >
                ＋ 新しい作業
              </button>
            </div>

            <nav className="space-y-1 overflow-y-auto px-3">
              {sessions.map((session) => (
                <div key={session.id}>
                  {editingTitleSessionId === session.id ? (
                    <div className="flex items-center gap-2 rounded-lg bg-zinc-100 p-2">
                      <input
                        type="text"
                        value={titleInput}
                        onChange={(event) => setTitleInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            saveTitle();
                          }

                          if (event.key === "Escape") {
                            cancelEditingTitle();
                          }
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
                      />

                      <button
                        type="button"
                        onClick={saveTitle}
                        className="shrink-0 rounded-lg px-2 py-2 text-zinc-600 hover:bg-white hover:text-zinc-900"
                      >
                        ✓
                      </button>

                      <button
                        type="button"
                        onClick={cancelEditingTitle}
                        className="shrink-0 rounded-lg px-2 py-2 text-zinc-500 hover:bg-white"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setEditingTitleSessionId(null);
                        setIsSidebarOpen(false);
                      }}
                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setContextMenuSessionId(session.id);
                        }, 500);
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onTouchMove={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      className={`w-full select-none rounded-lg px-3 py-3 text-left text-sm ${
                        session.id === activeSessionId
                          ? "bg-zinc-100 font-medium"
                          : "hover:bg-zinc-100"
                      }`}
                    >
                      {session.title}
                    </button>
                  )}
                </div>
              ))}
            </nav>
            {contextMenuSessionId !== null && (
              <div className="border-t border-zinc-200 p-3">
                <div className="mb-2 text-xs text-zinc-500">
                  {
                    sessions.find(
                      (session) => session.id === contextMenuSessionId,
                    )?.title
                  }
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const session = sessions.find(
                      (session) => session.id === contextMenuSessionId,
                    );

                    if (!session) return;

                    startEditingTitle(session);
                    setContextMenuSessionId(null);
                  }}
                  className="w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-zinc-100"
                >
                  名前を変更
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setContextMenuSessionId(null);
                  }}
                  className="mt-1 w-full rounded-lg px-3 py-3 text-left text-sm text-zinc-500 hover:bg-zinc-100"
                >
                  キャンセル
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
      {todoDraft && <TodoCreateDialog title={todoDraft.title} content={todoDraft.content} saving={isCreatingTodo} errorMessage={todoCreateError} noticeMessage={todoDraftError ? `AI生成に失敗しました。元メッセージを入力しています。${todoDraftError}` : ""} onTitleChange={title => setTodoDraft(current => current ? { ...current, title } : current)} onContentChange={content => setTodoDraft(current => current ? { ...current, content } : current)} onSubmit={handleRegisterTodo} onClose={handleCloseTodoDialog} />}
    </main>
  );
}
