const MAX_SEARCH_RESULTS = 8;
const MAX_DETAIL_CHARS = 12_000;
const REQUEST_TIMEOUT_MS = 8_000;

export type LogSummary = {
  slug: string;
  type: string;
  createdAt: string;
  title: string;
  category: string;
};

export class LogsApiError extends Error {}

function getConfig(): { baseUrl: URL; apiKey: string } {
  const baseUrlValue = process.env.LOG_API_BASE_URL;
  const apiKey = process.env.LOG_API_KEY;

  if (!baseUrlValue || !apiKey) {
    throw new LogsApiError("ログ検索のサーバー設定がありません");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new LogsApiError("ログ検索のサーバー設定が不正です");
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new LogsApiError("ログ検索のサーバー設定が不正です");
  }

  return { baseUrl, apiKey };
}

async function requestJson(path: string, params?: URLSearchParams): Promise<unknown> {
  const { baseUrl, apiKey } = getConfig();
  const url = new URL(path, baseUrl);
  if (params) url.search = params.toString();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new LogsApiError("ログ API に接続できませんでした");
  }

  if (!response.ok) {
    throw new LogsApiError("ログ API がリクエストを処理できませんでした");
  }

  try {
    return await response.json();
  } catch {
    throw new LogsApiError("ログ API の応答形式が不正です");
  }
}

export async function searchLogs(input: {
  query: string;
  category?: string;
  limit?: number;
}): Promise<LogSummary[]> {
  const query = input.query.trim().slice(0, 300);
  if (!query) throw new LogsApiError("検索語を入力してください");

  const params = new URLSearchParams({ q: query, limit: String(input.limit ?? MAX_SEARCH_RESULTS) });
  if (input.category) params.set("category", input.category.slice(0, 100));

  const data = await requestJson("/api/logs", params);
  if (!Array.isArray(data)) throw new LogsApiError("ログ API の応答形式が不正です");

  return data.slice(0, MAX_SEARCH_RESULTS).map((item) => {
    if (
      !item || typeof item !== "object" ||
      !["slug", "type", "createdAt", "title", "category"].every(
        (key) => typeof (item as Record<string, unknown>)[key] === "string",
      )
    ) throw new LogsApiError("ログ API の応答形式が不正です");

    const log = item as Record<string, string>;
    return {
      slug: log.slug.slice(0, 200),
      type: log.type.slice(0, 40),
      createdAt: log.createdAt.slice(0, 80),
      title: log.title.slice(0, 300),
      category: log.category.slice(0, 120),
    };
  });
}

export async function getLog(slug: string): Promise<unknown> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(slug)) {
    throw new LogsApiError("ログの指定が不正です");
  }

  const data = await requestJson(`/api/logs/${encodeURIComponent(slug)}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new LogsApiError("ログ API の応答形式が不正です");
  }

  const log = data as Record<string, unknown>;
  if (log.slug !== slug || typeof log.title !== "string") {
    throw new LogsApiError("ログ API の応答形式が不正です");
  }

  const serialized = JSON.stringify(data);
  if (serialized.length > MAX_DETAIL_CHARS) {
    throw new LogsApiError("ログの内容が上限を超えています");
  }
  return data;
}
