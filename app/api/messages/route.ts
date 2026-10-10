import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const sessionId = Number(body.sessionId);
    const content = String(body.content ?? "").trim();
    const role = String(body.role ?? "");

    if (!Number.isInteger(sessionId)) {
      return NextResponse.json(
        { error: "不正なsessionIdです" },
        { status: 400 },
      );
    }

    if (!content) {
      return NextResponse.json(
        { error: "contentを入力してください" },
        { status: 400 },
      );
    }

    if (!["user", "assistant"].includes(role)) {
      return NextResponse.json({ error: "不正なroleです" }, { status: 400 });
    }

    const messages = await sql`
      WITH updated_session AS (
        UPDATE sessions
        SET updated_at = NOW()
        WHERE id = ${sessionId}
        RETURNING id
      ), inserted_message AS (
        INSERT INTO messages (
          session_id,
          content,
          role
        )
        SELECT
          updated_session.id,
          ${content},
          ${role}
        FROM updated_session
        RETURNING
          id,
          session_id,
          content,
          role,
          created_at
      )
      SELECT
        id,
        session_id,
        content,
        role,
        created_at
      FROM inserted_message
    `;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "セッションが見つかりません" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: messages[0],
    });
  } catch (error) {
    console.error("Messages POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "メッセージの保存に失敗しました",
      },
      { status: 500 },
    );
  }
}
