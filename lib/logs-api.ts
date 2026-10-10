const MAX_SEARCH_RESULTS = 8;
const MAX_DETAIL_CHARS = 12_000;
const REQUEST_TIMEOUT_MS = 8_000;

type LogsApiErrorCode =
  | "configuration_missing"
  | "configuration_invalid"
  | "connection_failed"
  | "http_error"
  | "invalid_json"
  | "invalid_response";

export type LogSummary = {
  slug: string;
  type: string;
  createdAt: string;
  title: string;
  category: string;
};

export class LogsApiError extends Error {
  constructor(
    message: string,
    readonly code: LogsApiErrorCode,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LogsApiError";
  }
}

function logApiDiagnostic(event: string, details: Record<string, unknown>, level: "info" | "error" = "info") {
  console[level](`${event} ${JSON.stringify(details)}`);
}

function getConfig(): { baseUrl: URL; apiKey: string } {
  const baseUrlValue = process.env.LOG_API_BASE_URL;
  const apiKey = process.env.LOG_API_KEY;

  if (!baseUrlValue || !apiKey) {
    throw new LogsApiError(
      "ログ検索のサーバー設定がありません",
      "configuration_missing",
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new LogsApiError("ログ検索のサーバー設定が不正です", "configuration_invalid");
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new LogsApiError("ログ検索のサーバー設定が不正です", "configuration_invalid");
  }

  return { baseUrl, apiKey };
}

async function requestJson(
  operation: "search" | "detail",
  requestId: string,
  path: string,
  params?: URLSearchParams,
): Promise<unknown> {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    const code = error instanceof LogsApiError ? error.code : "configuration_invalid";
    logApiDiagnostic("Log API configuration failed", {
      requestId,
      operation,
      code,
      hasBaseUrl: Boolean(process.env.LOG_API_BASE_URL),
      hasApiKey: Boolean(process.env.LOG_API_KEY),
    }, "error");
    throw error;
  }

  const { baseUrl, apiKey } = config;
  const url = new URL(path, baseUrl);
  if (params) url.search = params.toString();
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    logApiDiagnostic("Log API request failed", {
      requestId,
      operation,
      reason: "connection",
      errorName: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    }, "error");
    throw new LogsApiError("ログ API に接続できませんでした", "connection_failed");
  }

  if (!response.ok) {
    logApiDiagnostic("Log API request failed", {
      requestId,
      operation,
      reason: "http",
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    }, "error");
    throw new LogsApiError(
      "ログ API がリクエストを処理できませんでした",
      "http_error",
      response.status,
    );
  }

  try {
    const data: unknown = await response.json();
    logApiDiagnostic("Log API request succeeded", {
      requestId,
      operation,
      statusCode: response.status,
      responseType: Array.isArray(data) ? "array" : typeof data,
      itemCount: Array.isArray(data) ? data.length : undefined,
      durationMs: Date.now() - startedAt,
    });
    return data;
  } catch {
    logApiDiagnostic("Log API response parsing failed", {
      requestId,
      operation,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    }, "error");
    throw new LogsApiError("ログ API の応答形式が不正です", "invalid_json");
  }
}

export async function searchLogs(input: {
  query: string;
  category?: string;
  limit?: number;
  requestId?: string;
}): Promise<LogSummary[]> {
  const query = input.query.trim().slice(0, 300);
  if (!query) throw new LogsApiError("検索語を入力してください", "invalid_response");

  const params = new URLSearchParams({ q: query, limit: String(input.limit ?? MAX_SEARCH_RESULTS) });
  if (input.category) params.set("category", input.category.slice(0, 100));

  const data = await requestJson("search", input.requestId ?? "unknown", "/api/logs", params);
  if (!Array.isArray(data)) {
    logApiDiagnostic("Log API response validation failed", {
      requestId: input.requestId,
      operation: "search",
      reason: "not_array",
    }, "error");
    throw new LogsApiError("ログ API の応答形式が不正です", "invalid_response");
  }

  try {
    return data.slice(0, MAX_SEARCH_RESULTS).map((item) => {
      if (
        !item || typeof item !== "object" ||
        !["slug", "type", "createdAt", "title", "category"].every(
          (key) => typeof (item as Record<string, unknown>)[key] === "string",
        )
      ) throw new Error("invalid item");

      const log = item as Record<string, string>;
      return {
        slug: log.slug.slice(0, 200),
        type: log.type.slice(0, 40),
        createdAt: log.createdAt.slice(0, 80),
        title: log.title.slice(0, 300),
        category: log.category.slice(0, 120),
      };
    });
  } catch {
    logApiDiagnostic("Log API response validation failed", {
      requestId: input.requestId,
      operation: "search",
      reason: "invalid_item",
    }, "error");
    throw new LogsApiError("ログ API の応答形式が不正です", "invalid_response");
  }
}

export async function getLog(slug: string, requestId?: string): Promise<unknown> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(slug)) {
    throw new LogsApiError("ログの指定が不正です", "invalid_response");
  }

  const data = await requestJson(
    "detail",
    requestId ?? "unknown",
    `/api/logs/${encodeURIComponent(slug)}`,
  );
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new LogsApiError("ログ API の応答形式が不正です", "invalid_response");
  }

  const log = data as Record<string, unknown>;
  if (log.slug !== slug || typeof log.title !== "string") {
    throw new LogsApiError("ログ API の応答形式が不正です", "invalid_response");
  }

  const serialized = JSON.stringify(data);
  if (serialized.length > MAX_DETAIL_CHARS) {
    throw new LogsApiError("ログの内容が上限を超えています", "invalid_response");
  }
  return data;
}
