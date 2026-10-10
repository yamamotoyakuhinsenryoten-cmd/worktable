import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseChatSources } from "@/lib/chat-sources";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const sessionId = Number(body.sessionId);
    const content = String(body.content ?? "").trim();
    const role = String(body.role ?? "");
    const sources = body.sources === undefined ? null : parseChatSources(body.sources);

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

    if (body.sources !== undefined && sources === null) {
      return NextResponse.json({ error: "不正なsourcesです" }, { status: 400 });
    }

    if (role === "user" && sources && sources.length > 0) {
      return NextResponse.json({ error: "userメッセージにsourcesは指定できません" }, { status: 400 });
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
          role,
          sources
        )
        SELECT
          updated_session.id,
          ${content},
          ${role},
          ${sources === null ? null : JSON.stringify(sources)}::jsonb
        FROM updated_session
        RETURNING
          id,
          session_id,
          content,
          role,
          sources,
          created_at
      )
      SELECT
        id,
        session_id,
        content,
        role,
        sources,
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
