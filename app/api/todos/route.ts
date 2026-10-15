import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const tickets = await sql`
      SELECT id, title, content, status, created_at, updated_at
      FROM todos
      ORDER BY created_at DESC, id DESC
    `;
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("TODO GET error:", error);
    return NextResponse.json({ error: "チケットの取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    if (!title) return NextResponse.json({ error: "タイトルを入力してください" }, { status: 400 });
    const tickets = await sql`
      INSERT INTO todos (title, content, status)
      VALUES (${title}, ${content}, 'not_started')
      RETURNING id, title, content, status, created_at, updated_at
    `;
    return NextResponse.json({ ticket: tickets[0] }, { status: 201 });
  } catch (error) {
    console.error("TODO POST error:", error);
    return NextResponse.json({ error: "チケットの作成に失敗しました" }, { status: 500 });
  }
}
