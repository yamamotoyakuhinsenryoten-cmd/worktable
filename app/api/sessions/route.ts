import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const sessions = await sql`
      SELECT
        id,
        title,
        created_at,
        updated_at,
        log_generated,
        log_type,
        slug
      FROM sessions
      ORDER BY created_at ASC
    `;

    return NextResponse.json({
      sessions,
    });
  } catch (error) {
    console.error("Sessions GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "セッションの取得に失敗しました",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const title = String(body.title ?? "").trim();
    const logType = String(body.logType ?? "work");
    const slug = String(body.slug ?? "").trim();

    if (!title) {
      return NextResponse.json(
        { error: "titleを入力してください" },
        { status: 400 },
      );
    }

    if (!["work", "experience", "development"].includes(logType)) {
      return NextResponse.json({ error: "不正なlogTypeです" }, { status: 400 });
    }

    const sessions = await sql`
      INSERT INTO sessions (
        title,
        log_type,
        slug
      )
      VALUES (
        ${title},
        ${logType},
        ${slug}
      )
      RETURNING
        id,
        title,
        created_at,
        updated_at,
        log_generated,
        log_type,
        slug
    `;

    return NextResponse.json({
      session: sessions[0],
    });
  } catch (error) {
    console.error("Sessions POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "セッションの作成に失敗しました",
      },
      { status: 500 },
    );
  }
}
