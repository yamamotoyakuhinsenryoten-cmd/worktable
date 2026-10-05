import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sessionId = Number(id);

    if (!Number.isInteger(sessionId)) {
      return NextResponse.json(
        { error: "不正なsession idです" },
        { status: 400 },
      );
    }

    const body = await request.json();

    const title =
      body.title !== undefined ? String(body.title).trim() : undefined;

    const logType =
      body.logType !== undefined ? String(body.logType) : undefined;

    const slug = body.slug !== undefined ? String(body.slug).trim() : undefined;

    const logGenerated =
      body.logGenerated !== undefined ? Boolean(body.logGenerated) : undefined;

    if (
      logType !== undefined &&
      !["work", "experience", "development"].includes(logType)
    ) {
      return NextResponse.json({ error: "不正なlogTypeです" }, { status: 400 });
    }

    const sessions = await sql`
      UPDATE sessions
      SET
        title = COALESCE(${title ?? null}, title),
        log_type = COALESCE(${logType ?? null}, log_type),
        slug = COALESCE(${slug ?? null}, slug),
        log_generated = COALESCE(${logGenerated ?? null}, log_generated),
        updated_at = NOW()
      WHERE id = ${sessionId}
      RETURNING
        id,
        title,
        created_at,
        updated_at,
        log_generated,
        log_type,
        slug
    `;

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "セッションが見つかりません" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      session: sessions[0],
    });
  } catch (error) {
    console.error("Session PATCH error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "セッションの更新に失敗しました",
      },
      { status: 500 },
    );
  }
}
