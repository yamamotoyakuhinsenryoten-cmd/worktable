import { NextResponse } from "next/server";
import { getLog, LogsApiError } from "@/lib/logs-api";
import { buildInstagramCaption, safeExternalError, selectInstagramImages, type InstagramLog } from "@/lib/instagram";
import { getMediaUrl } from "@/lib/media";

export const runtime = "nodejs";

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const API_VERSION = "v24.0";
const BASE_URL = `https://graph.instagram.com/${API_VERSION}`;
const activePosts = new Set<string>();

async function requestInstagram(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const graphError = data?.error as Record<string, unknown> | undefined;
    throw new Error(typeof graphError?.message === "string"
      ? `Instagram API: ${graphError.message}`
      : `Instagram APIがHTTP ${response.status}を返しました`);
  }
  return data ?? {};
}

async function getInstagramUserId() {
  const url = new URL(`${BASE_URL}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", ACCESS_TOKEN);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof data?.user_id !== "string") {
    const graphError = data?.error as Record<string, unknown> | undefined;
    throw new Error(typeof graphError?.message === "string"
      ? `Instagram API: ${graphError.message}`
      : `Instagramアカウントを取得できませんでした (HTTP ${response.status})`);
  }
  return data.user_id;
}

async function waitForFinished(containerId: string) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  for (let attempt = 0; attempt < 30; attempt++) {
    const url = new URL(`${BASE_URL}/${containerId}`);
    url.searchParams.set("fields", "status_code,status");
    url.searchParams.set("access_token", ACCESS_TOKEN);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const graphError = data?.error as Record<string, unknown> | undefined;
      throw new Error(typeof graphError?.message === "string"
        ? `Instagram API: ${graphError.message}`
        : `投稿コンテナの状態を取得できませんでした (HTTP ${response.status})`);
    }
    if (data?.status_code === "FINISHED") return;
    if (data?.status_code === "ERROR" || data?.status_code === "EXPIRED") {
      throw new Error("Instagramの投稿コンテナ処理に失敗しました");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Instagramの投稿コンテナがタイムアウトしました");
}

export async function POST(request: Request) {
  if (!ACCESS_TOKEN) {
    return NextResponse.json({ error: "Instagram投稿のサーバー設定がありません" }, { status: 503 });
  }

  try {
    const body = await request.json() as { slug?: unknown; logType?: unknown };
    const slug = body.slug;
    const logType = body.logType;
    if (typeof slug !== "string" || !slug.trim()) {
      return NextResponse.json({ error: "ログが登録されていません" }, { status: 404 });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(slug)) {
      return NextResponse.json({ error: "slugの指定が不正です" }, { status: 400 });
    }
    if (logType !== "work" && logType !== "experience") {
      return NextResponse.json({ error: "Instagram投稿はworkまたはexperienceのみ対応しています" }, { status: 400 });
    }

    const requestKey = `${logType}:${slug}`;
    if (activePosts.has(requestKey)) {
      return NextResponse.json({ error: "Instagram投稿を処理中です" }, { status: 409 });
    }
    activePosts.add(requestKey);

    try {
    let rawLog: unknown;
    try {
      rawLog = await getLog(slug);
    } catch (error) {
      if (error instanceof LogsApiError && error.statusCode === 404) {
        return NextResponse.json({ error: "ログが登録されていません" }, { status: 404 });
      }
      throw error;
    }
    const log = rawLog as InstagramLog;
    if (log.type !== logType || !Array.isArray(log.media)) {
      return NextResponse.json({ error: "ログが登録されていません" }, { status: 404 });
    }

    const { images, totalImageCount } = selectInstagramImages(log.media);
    if (images.length === 0) {
      return NextResponse.json({ error: "追加する画像がありません" }, { status: 400 });
    }

    const userId = await getInstagramUserId();
    const children: string[] = [];
    for (const image of images) {
      const result = await requestInstagram(`/${userId}/media`, {
        image_url: getMediaUrl(image.src),
        is_carousel_item: "true",
        access_token: ACCESS_TOKEN,
      });
      if (typeof result.id !== "string") throw new Error("Instagramが画像コンテナIDを返しませんでした");
      children.push(result.id);
    }

    const carousel = await requestInstagram(`/${userId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: buildInstagramCaption(log),
      access_token: ACCESS_TOKEN,
    });
    if (typeof carousel.id !== "string") throw new Error("Instagramが投稿コンテナIDを返しませんでした");

    await waitForFinished(carousel.id);
    const published = await requestInstagram(`/${userId}/media_publish`, {
      creation_id: carousel.id,
      access_token: ACCESS_TOKEN,
    });
    if (typeof published.id !== "string") throw new Error("Instagramが投稿IDを返しませんでした");

    return NextResponse.json({
      success: true,
      imageCount: images.length,
      totalImageCount,
      truncated: totalImageCount > images.length,
    });
    } finally {
      activePosts.delete(requestKey);
    }
  } catch (error) {
    console.error("Instagram post error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({
      error: safeExternalError(error, [ACCESS_TOKEN, process.env.LOG_API_KEY ?? ""]),
    }, { status: 500 });
  }
}
