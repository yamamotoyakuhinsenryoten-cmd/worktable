import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

const statuses = ["not_started", "in_progress", "completed"] as const;

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "不正なチケットIDです" }, { status: 400 });
    }
    const body = await request.json();
    const hasTitle = Object.hasOwn(body, "title");
    const hasContent = Object.hasOwn(body, "content");
    const hasStatus = Object.hasOwn(body, "status");
    if (!hasTitle && !hasContent && !hasStatus) {
      return NextResponse.json({ error: "更新内容がありません" }, { status: 400 });
    }
    if (hasTitle && (typeof body.title !== "string" || !body.title.trim())) {
      return NextResponse.json({ error: "タイトルを入力してください" }, { status: 400 });
    }
    if (hasContent && typeof body.content !== "string") {
      return NextResponse.json({ error: "内容が不正です" }, { status: 400 });
    }
    if (hasStatus && !statuses.includes(body.status)) {
      return NextResponse.json({ error: "不正なステータスです" }, { status: 400 });
    }

    const tickets = await sql`
      UPDATE todos
      SET title = CASE WHEN ${hasTitle} THEN ${hasTitle ? body.title.trim() : ""} ELSE title END,
          content = CASE WHEN ${hasContent} THEN ${hasContent ? body.content : ""} ELSE content END,
          status = CASE WHEN ${hasStatus} THEN ${hasStatus ? body.status : "not_started"} ELSE status END,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, title, content, status, created_at, updated_at
    `;
    if (!tickets.length) return NextResponse.json({ error: "チケットが見つかりません" }, { status: 404 });
    return NextResponse.json({ ticket: tickets[0] });
  } catch (error) {
    console.error("TODO PATCH error:", error);
    return NextResponse.json({ error: "チケットの更新に失敗しました" }, { status: 500 });
  }
}
