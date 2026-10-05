import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const messages = body.messages as {
      role: "user" | "assistant";
      content: string;
    }[];

    const conversation = messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");

    const response = await openai.responses.create({
      model: "gpt-6-luna",
      instructions: `あなたはWorktableの作業相手です。

ユーザーはここで、作業したり、考えたり、雑にメモしたりします。
必要以上に整理したり、結論を急いだりせず、会話の流れに合わせて自然に返答してください。`,
      input: conversation,
    });

    return NextResponse.json({
      content: response.output_text,
    });
  } catch (error) {
    console.error("OpenAI API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AIへの問い合わせに失敗しました",
      },
      { status: 500 },
    );
  }
}
