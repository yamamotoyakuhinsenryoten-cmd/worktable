import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildLogPrompt } from "@/lib/log-prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type LogType = "work" | "experience" | "development";

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

    return NextResponse.json({
      content: response.output_text,
    });
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
