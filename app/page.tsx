"use client";

import { useEffect, useState } from "react";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
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
  const [isGeneratingLog, setIsGeneratingLog] = useState(false);
  const [generatedLog, setGeneratedLog] = useState("");
  const [isRegisteringLog, setIsRegisteringLog] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [mediaMessage, setMediaMessage] = useState("");

  // 保存済みデータを読み込む
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await fetch("/api/sessions");

        if (!response.ok) {
          throw new Error("セッションの取得に失敗しました");
        }

        const data = await response.json();

        const loadedSessions: Session[] = await Promise.all(
          data.sessions.map(
            async (session: {
              id: number;
              title: string;
              log_type: "work" | "experience" | "development";
              slug: string;
              log_generated: boolean;
            }) => {
              const messagesResponse = await fetch(
                `/api/sessions/${session.id}/messages`,
              );

              if (!messagesResponse.ok) {
                throw new Error(
                  `Session ${session.id} のメッセージ取得に失敗しました`,
                );
              }

              const messagesData = await messagesResponse.json();

              const messages: Message[] = messagesData.messages.map(
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

              return {
                id: session.id,
                title: session.title,
                logType: session.log_type,
                slug: session.slug,
                logGenerated: session.log_generated,
                messages,
              };
            },
          ),
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

  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );

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

    if (!content || activeSessionId === null) return;

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
    } catch (error) {
      console.error(error);
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
    <main className="flex h-screen bg-zinc-100 text-zinc-900">
      {/* 左：セッション一覧 */}
      <aside className="flex w-64 flex-col border-r border-zinc-200 bg-white">
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
      <section className="flex min-w-0 flex-1 flex-col">
        {/* ヘッダー */}
        <header className="border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-medium">{activeSession?.title ?? "作業"}</h2>

              {activeSession && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
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
                    <option value="work">work</option>
                    <option value="experience">experience</option>
                    <option value="development">development</option>
                  </select>

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
                    className="w-64 rounded-md border border-zinc-300 px-3 py-1 text-sm outline-none focus:border-zinc-500"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateLog}
              disabled={
                isGeneratingLog ||
                !activeSession ||
                activeSession.messages.length === 0
              }
              className="shrink-0 rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGeneratingLog ? "生成中…" : "ログを生成"}
            </button>
          </div>
        </header>

        {/* メッセージ */}
        <div className="flex-1 overflow-y-auto p-6">
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
              activeSession?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl p-4 shadow-sm ${
                    message.role === "assistant" ? "bg-zinc-200" : "bg-white"
                  }`}
                >
                  {message.content}
                </div>
              ))
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
          </div>
        </div>

        {/* 入力 */}
        <div className="border-t border-zinc-200 bg-white p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="ここに雑に書く……"
              disabled={isAskingAI}
              className="min-h-12 w-full resize-none rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={handleAskAI}
                disabled={isAskingAI || !input.trim()}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isAskingAI ? "考え中…" : "AIに聞く"}
              </button>

              <button
                onClick={handleSend}
                disabled={isAskingAI || !input.trim()}
                className="rounded-xl bg-zinc-900 px-5 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                送る
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
