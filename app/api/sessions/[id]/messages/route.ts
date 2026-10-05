import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sessionId = Number(id);

    if (!Number.isInteger(sessionId)) {
      return NextResponse.json(
        { error: "不正なsession idです" },
        { status: 400 },
      );
    }

    const messages = await sql`
      SELECT
        id,
        session_id,
        content,
        role,
        created_at
      FROM messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC, id ASC
    `;

    return NextResponse.json({
      messages,
    });
  } catch (error) {
    console.error("Messages GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "メッセージの取得に失敗しました",
      },
      { status: 500 },
    );
  }
}
