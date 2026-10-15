import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildTodoDraftPrompt, parseTodoDraft, type TodoSourceMessage } from "@/lib/todo-draft";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    const { selected, context } = body as { selected?: unknown; context?: unknown };
    const isMessage = (value: unknown): value is TodoSourceMessage => !!value && typeof value === "object" &&
      ["user", "assistant"].includes((value as TodoSourceMessage).role) && typeof (value as TodoSourceMessage).content === "string";
    if (!isMessage(selected) || !Array.isArray(context) || context.length < 1 || context.length > 7 || !context.every(isMessage)) {
      return NextResponse.json({ error: "メッセージが不正です" }, { status: 400 });
    }
    if (!context.some(message => message.role === selected.role && message.content === selected.content)) {
      return NextResponse.json({ error: "選択メッセージが文脈に含まれていません" }, { status: 400 });
    }
    if (context.some(message => message.content.length > 20_000) || selected.content.length > 20_000) {
      return NextResponse.json({ error: "メッセージが長すぎます" }, { status: 400 });
    }

    const response = await openai.responses.create({ model: "gpt-6-luna", input: buildTodoDraftPrompt(selected, context) });
    const draft = parseTodoDraft(response.output_text);
    if (!draft) return NextResponse.json({ error: "AIのTODO案を読み取れませんでした" }, { status: 422 });
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("TODO draft generation error:", error);
    return NextResponse.json({ error: "TODO案の生成に失敗しました" }, { status: 500 });
  }
}
