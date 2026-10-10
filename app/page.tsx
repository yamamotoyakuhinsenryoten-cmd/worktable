"use client";

import { useEffect, useRef, useState } from "react";

type ChatSource = {
  slug: string;
  title: string;
};

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

function createTitle() {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [editingTitleSessionId, setEditingTitleSessionId] = useState<
    number | null
  >(null);
  const [titleInput, setTitleInput] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingLog, setIsGeneratingLog] = useState(false);
  const [generatedLog, setGeneratedLog] = useState("");
  const [isRegisteringLog, setIsRegisteringLog] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [mediaMessage, setMediaMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [contextMenuSessionId, setContextMenuSessionId] = useState<
    number | null
  >(null);
  const [inputMode, setInputMode] = useState<"talk" | "write">("talk");

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<"bottom" | "assistant" | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        if (loadedSessions.length > 0) {
          setActiveSessionId(loadedSessions[0].id);
        }
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
          }) => ({
            id: message.id,
            role: message.role,
            content: message.content,
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

  // 新しいセッションを作る
  const handleCreateSession = async () => {
    try {
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

      setSessions((current) => [...current, session]);
      setActiveSessionId(session.id);
      setInput("");
    } catch (error) {
      console.error(error);
    }
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

    if (!content || activeSessionId === null || isSending || isAskingAI) {
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          content,
          role: "user",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "メッセージの保存に失敗しました");
      }

      setSessions((current) =>
        current.map((session) => {
          if (session.id !== activeSessionId) {
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
        }),
      );

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

    if (!content || activeSessionId === null || isAskingAI) return;

    setInput("");
    setIsAskingAI(true);

    try {
      // ユーザーの発言をDBに保存
      const userResponse = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          content,
          role: "user",
        }),
      });

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error(userData.error ?? "メッセージの保存に失敗しました");
      }

      const userMessage: Message = {
        id: userData.message.id,
        role: userData.message.role,
        content: userData.message.content,
      };

      // 画面にもユーザーの発言を追加
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== activeSessionId) {
            return session;
          }

          return {
            ...session,
            messages: [...session.messages, userMessage],
          };
        }),
      );

      // AIに送る会話
      const currentMessages =
        sessions.find((session) => session.id === activeSessionId)?.messages ??
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

      // AIの返答をDBに保存
      const assistantResponse = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          content: data.content,
          role: "assistant",
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
        sources: Array.isArray(data.sources)
          ? data.sources.filter(
              (source: unknown): source is ChatSource =>
                !!source && typeof source === "object" &&
                typeof (source as ChatSource).slug === "string" &&
                typeof (source as ChatSource).title === "string",
            )
          : [],
      };

      // 画面にもAIの返答を追加
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== activeSessionId) {
            return session;
          }

          return {
            ...session,
            messages: [...session.messages, assistantMessage],
          };
        }),
      );
      pendingScrollRef.current = "assistant";
    } catch (error) {
      console.error(error);

      const errorMessage: Message = {
        id: Date.now(),
        role: "assistant",
        content: "AIへの問い合わせに失敗しました。",
      };

      setSessions((current) =>
        current.map((session) => {
          if (session.id !== activeSessionId) {
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
    setGeneratedLog("");

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

      // ログ生成成功
      setGeneratedLog(data.content);

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
    } catch (error) {
      console.error(error);

      setGeneratedLog(
        error instanceof Error ? error.message : "ログの生成に失敗しました",
      );
    } finally {
      setIsGeneratingLog(false);
    }
  };

  // ログをサイトに登録
  const handleRegisterLog = async () => {
    if (!activeSession || !generatedLog) return;

    setIsRegisteringLog(true);
    setRegistrationMessage("");

    try {
      const response = await fetch("/api/register-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: generatedLog,
          logType: activeSession.logType,
          slug: activeSession.slug,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "サイトへの登録に失敗しました");
      }

      setRegistrationMessage(`✓ サイトに登録しました：${data.file}`);
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
    if (!activeSession) return;

    setIsAddingMedia(true);
    setMediaMessage("");

    try {
      const response = await fetch("/api/add-log-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: activeSession.slug,
          logType: activeSession.logType,
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

  return (
    <main className="flex h-dvh bg-zinc-100 text-zinc-900">
      {/* 左：セッション一覧 */}
      <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="border-b border-zinc-200 p-4">
          <h1 className="text-lg font-semibold">Worktable</h1>
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
              <h2 className="min-w-0 truncate text-sm font-medium">
                {" "}
                {activeSession?.title ?? "作業"}{" "}
              </h2>{" "}
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
        </header>
        {/* メッセージ */}
        <div
          ref={messagesContainerRef}
          className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
        >
          <div className="mx-auto max-w-3xl space-y-4">
            {activeSession?.messages.length === 0 ? (
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
                  </div>
                );
              })
            )}
            {generatedLog && (
              <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="mb-4 text-sm font-medium text-zinc-500">
                  生成されたログ
                </div>

                <pre className="whitespace-pre-wrap text-sm leading-7">
                  {generatedLog}
                </pre>
                <div className="mt-6 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleRegisterLog}
                    disabled={isRegisteringLog}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isRegisteringLog ? "登録中..." : "サイトに登録"}
                  </button>

                  {registrationMessage && (
                    <p className="text-sm text-zinc-600">
                      {registrationMessage}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleAddMedia}
                    disabled={isAddingMedia}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {isAddingMedia ? "追加中..." : "メディアを追加"}
                  </button>

                  {mediaMessage && (
                    <p className="text-sm text-zinc-600">{mediaMessage}</p>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        {/* 入力 */}
        <div className="shrink-0 border-t border-zinc-200 bg-white p-3 md:p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <textarea
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
              className="min-h-12 w-full resize-none rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100 md:text-sm"
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
              <h1 className="text-lg font-semibold">Worktable</h1>

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
    </main>
  );
}
