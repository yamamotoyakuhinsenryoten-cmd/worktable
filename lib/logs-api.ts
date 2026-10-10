const MAX_SEARCH_RESULTS = 100;
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

type SearchDiagnosticContext = {
  searchExecution: number;
  searchAttempt: number;
  searchAttempts: number;
  aiQuery: string;
  apiParams: Record<string, string>;
};

function searchDiagnosticDetails(context?: SearchDiagnosticContext): Record<string, unknown> {
  // Search terms may contain personal information; expose them only in local development logs.
  return process.env.NODE_ENV === "development" && context ? context : {};
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
  searchContext?: SearchDiagnosticContext,
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
  if (operation === "search") {
    logApiDiagnostic("Log API search dispatched", {
      requestId,
      operation,
      ...searchDiagnosticDetails(searchContext),
    });
  }

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
      ...searchDiagnosticDetails(searchContext),
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
      ...searchDiagnosticDetails(searchContext),
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
      ...searchDiagnosticDetails(searchContext),
      durationMs: Date.now() - startedAt,
    });
    return data;
  } catch {
    logApiDiagnostic("Log API response parsing failed", {
      requestId,
      operation,
      statusCode: response.status,
      ...searchDiagnosticDetails(searchContext),
      durationMs: Date.now() - startedAt,
    }, "error");
    throw new LogsApiError("ログ API の応答形式が不正です", "invalid_json");
  }
}

export async function searchLogs(input: {
  query: string;
  category?: string;
  limit?: number;
  latest?: boolean;
  aiQuery?: string;
  requestId?: string;
  searchExecution?: number;
}): Promise<LogSummary[]> {
  const query = input.query.normalize("NFKC").trim().slice(0, 300);
  const stopWords = new Set(["前回", "最近", "この前", "以前", "ログ", "記録", "何だっけ", "なんだっけ", "どう", "どこ", "だったっけ", "やつ"]);
  const terms = [...new Set(query.split(/[\s、,，。・|｜]+/u).filter((term) => term && !stopWords.has(term)))];
  const expandedTerms = new Set(terms);
  for (const term of terms) {
    if (/^(?:スタバ|スターバックス)$/iu.test(term)) {
      expandedTerms.add("Starbucks");
      expandedTerms.add("スターバックス");
    }
    if (/^starbucks$/iu.test(term)) {
      expandedTerms.add("スタバ");
      expandedTerms.add("スターバックス");
    }
    if (/^(?:深煎り|ダークロースト)$/iu.test(term)) {
      expandedTerms.add(term === "深煎り" ? "ダークロースト" : "深煎り");
    }
    if (/^オールシーズンズ$/iu.test(term)) {
      expandedTerms.add("ALL");
      expandedTerms.add("SEASONS");
      expandedTerms.add("COFFEE");
    }
    if (/^ALL$/iu.test(term)) expandedTerms.add("オールシーズンズ");
  }

  const searchTerms = [...expandedTerms].slice(0, 8);
  const attempts = searchTerms.length > 0 ? searchTerms : [""];
  const requestedLimit = Math.min(input.limit ?? 5, MAX_SEARCH_RESULTS);
  const requestId = input.requestId ?? "unknown";
  const responses = await Promise.all(attempts.map(async (term, index) => {
    const params = new URLSearchParams({ limit: String(MAX_SEARCH_RESULTS) });
    if (term) params.set("q", term);
    if (input.category) params.set("category", input.category.slice(0, 100));
    if (input.latest) params.set("sort", "recent");
    const apiParams: Record<string, string> = { limit: String(MAX_SEARCH_RESULTS) };
    if (term) apiParams.q = term;
    if (input.category) apiParams.category = input.category.slice(0, 100);
    if (input.latest) apiParams.sort = "recent";
    const data = await requestJson("search", requestId, "/api/logs", params, {
      searchExecution: input.searchExecution ?? 0,
      searchAttempt: index + 1,
      searchAttempts: attempts.length,
      aiQuery: input.aiQuery ?? input.query,
      apiParams,
    });
    if (!Array.isArray(data)) {
      logApiDiagnostic("Log API response validation failed", {
        requestId,
        operation: "search",
        searchExecution: input.searchExecution ?? 0,
        searchAttempt: index + 1,
        reason: "not_array",
      }, "error");
      throw new LogsApiError("ログ API の応答形式が不正です", "invalid_response");
    }

    try {
      return data.map((item) => {
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
        requestId,
        operation: "search",
        searchExecution: input.searchExecution ?? 0,
        searchAttempt: index + 1,
        reason: "invalid_item",
      }, "error");
      throw new LogsApiError("ログ API の応答形式が不正です", "invalid_response");
    }
  }));

  const ranked = new Map<string, { log: LogSummary; score: number }>();
  for (const results of responses) {
    for (const log of results) {
      const current = ranked.get(log.slug);
      if (current) current.score++;
      else ranked.set(log.slug, { log, score: 1 });
    }
  }
  return [...ranked.values()]
    .sort((a, b) => input.latest
      ? b.log.createdAt.localeCompare(a.log.createdAt) || b.score - a.score
      : b.score - a.score || b.log.createdAt.localeCompare(a.log.createdAt))
    .slice(0, requestedLimit)
    .map(({ log }) => log);
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
