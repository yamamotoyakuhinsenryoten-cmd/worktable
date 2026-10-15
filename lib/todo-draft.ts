export type TodoSourceMessage = { role: "user" | "assistant"; content: string };
export type TodoDraft = { title: string; content: string };

export function todoDraftGenerationError(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function selectTodoContext(messages: TodoSourceMessage[], selectedIndex: number) {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= messages.length) {
    throw new RangeError("選択したメッセージが見つかりません");
  }
  const start = Math.max(0, selectedIndex - 3);
  const end = Math.min(messages.length, selectedIndex + 4);
  return { selected: messages[selectedIndex], context: messages.slice(start, end), selectedIndex: selectedIndex - start };
}

export function buildTodoDraftPrompt(selected: TodoSourceMessage, context: TodoSourceMessage[]) {
  return `あなたは会話の1件のメッセージから、ユーザーが確認・編集するTODO案を作ります。JSONのみを返してください。形式: {"title":"...","content":"..."}

必ず守ること:
- 選択されたメッセージがTODOの主な情報源です。そのメッセージに明示された作業・依頼・課題だけをTODOにしてください。
- 周辺メッセージは指示語や話題の補足にのみ使います。周辺にだけある別の作業、予定、約束、事実は追加しないでください。
- 選択メッセージが作業を示していない場合も、内容を捏造せず、そのメッセージの意味を短く要約した案にしてください。
- タイトルは簡潔にし、内容には選択メッセージにある具体的な情報を整理してください。不明点を補完しないでください。

選択されたメッセージ:
<selected>${JSON.stringify(selected)}</selected>

前後の会話（会話順）:
<context>${JSON.stringify(context)}</context>`;
}

export function parseTodoDraft(value: string): TodoDraft | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.title !== "string" || !parsed.title.trim() || typeof parsed.content !== "string") return null;
    return { title: parsed.title.trim().slice(0, 300), content: parsed.content };
  } catch {
    return null;
  }
}
