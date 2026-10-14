import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildLogPrompt } from "@/lib/log-prompts";
import { CATEGORY_FIELDS, LOG_CATEGORIES, emptyLogDraft, validateLogDraft, type LogType } from "@/lib/log-schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const messages = body.messages as Message[];
    const logType = body.logType as LogType;
    const slug = String(body.slug ?? "").trim();

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        {
          error: "メッセージが不正です",
        },
        { status: 400 },
      );
    }

    if (!["work", "experience", "development"].includes(logType)) {
      return NextResponse.json(
        {
          error: "不正なログタイプです",
        },
        { status: 400 },
      );
    }

    if (!slug) {
      return NextResponse.json(
        {
          error: "slugを入力してください",
        },
        { status: 400 },
      );
    }

    const conversation = messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");

    const prompt = buildLogPrompt({
      logType,
      slug,
      conversation,
    });

    const response = await openai.responses.create({
      model: "gpt-6-luna",
      input: prompt,
    });

    let draft: unknown;
    try {
      draft = JSON.parse(response.output_text);
    } catch {
      return NextResponse.json({ error: "AIの応答をログデータとして解析できませんでした。もう一度生成してください。" }, { status: 422 });
    }
    if (!validateLogDraft(draft) || draft.slug !== slug || draft.type !== logType) {
      return NextResponse.json({ error: "AIの応答に必須項目の欠落または型・カテゴリの不正があります。もう一度生成してください。" }, { status: 422 });
    }
    if (logType !== "development") {
      const requiredLabels = CATEGORY_FIELDS[logType][draft.category].map(({ label }) => label);
      const labels = draft.details!.map(({ label }) => label);
      if (labels.length !== requiredLabels.length || requiredLabels.some((label, index) => labels[index] !== label)) {
        return NextResponse.json({ error: "AIの応答にカテゴリ別項目の欠落または順序の不正があります。もう一度生成してください。" }, { status: 422 });
      }
    }
    if (!LOG_CATEGORIES[logType].includes(draft.category)) return NextResponse.json({ error: "AIの応答に不正なカテゴリがあります。" }, { status: 422 });
    const normalized = emptyLogDraft(logType, draft.category, slug);
    return NextResponse.json({ draft: { ...normalized, ...draft, source: { title: "生成元チャット", service: "Worktable", url: "" }, media: [] } });
  } catch (error) {
    console.error("Log generation error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ログの生成に失敗しました",
      },
      { status: 500 },
    );
  }
}
