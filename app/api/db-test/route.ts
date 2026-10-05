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
      success: true,
      sessions,
    });
  } catch (error) {
    console.error("Database error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "データベース処理に失敗しました",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const title = String(body.title ?? "").trim();

    if (!title) {
      return NextResponse.json(
        { error: "titleを入力してください" },
        { status: 400 },
      );
    }

    const sessions = await sql`
      INSERT INTO sessions (title)
      VALUES (${title})
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
      success: true,
      session: sessions[0],
    });
  } catch (error) {
    console.error("Database error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "データベース処理に失敗しました",
      },
      { status: 500 },
    );
  }
}
