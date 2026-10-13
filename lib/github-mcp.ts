import { createHash } from "node:crypto";

const MCP_ENDPOINT = "https://api.githubcopilot.com/mcp/readonly";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const REPOSITORY_OWNER = "yamamotoyakuhinsenryoten-cmd";
const REPOSITORY_NAME = "worktable";
const MAX_MCP_TEXT_LENGTH = 20_000;
const MAX_FULL_FILE_CHARACTERS = 12_000;
const MAX_FILE_RANGE_LINES = 120;
const MAX_FILE_RANGE_CHARACTERS = 12_000;

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
};

type McpResource = {
  text?: unknown;
  blob?: unknown;
  mimeType?: unknown;
};
type McpContentBlock = {
  type?: string;
  text?: string;
  resource?: McpResource;
};
type McpToolResult = {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
};
type McpToolCall = {
  result: McpToolResult;
  responseBodyBytes: number;
  responseBodyLines: number;
};

export class GitHubMcpError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly mcpErrorCode?: number;
  readonly reason?: string;
  readonly mcpStage?: string;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    mcpErrorCode?: number,
    reason?: string,
    mcpStage?: string,
  ) {
    super(message);
    this.name = "GitHubMcpError";
    this.code = code;
    this.statusCode = statusCode;
    this.mcpErrorCode = mcpErrorCode;
    this.reason = reason;
    this.mcpStage = mcpStage;
  }
}

function getToken(): string {
  const token = process.env.GITHUB_MCP_TOKEN;
  if (!token?.trim()) {
    throw new GitHubMcpError(
      "GITHUB_MCP_TOKEN is not configured",
      "GITHUB_MCP_TOKEN_MISSING",
      undefined,
      undefined,
      "token_missing",
    );
  }
  return token;
}

function classifyRemoteMessage(message: string | undefined): string {
  if (!message) return "unspecified";
  if (/unauthorized|invalid token|bad credentials/i.test(message)) return "authentication_failed";
  if (/forbidden|insufficient.*scope|permission/i.test(message)) return "permission_denied";
  if (/not found|unknown tool|method not found/i.test(message)) return "not_found";
  if (/invalid.*(argument|parameter)|validation/i.test(message)) return "invalid_request";
  return "remote_error";
}

function readMcpError(body: string): JsonRpcResponse["error"] {
  try {
    const parsed = JSON.parse(body) as JsonRpcResponse;
    return parsed.error;
  } catch {
    return undefined;
  }
}

async function postMessage(
  message: Record<string, unknown>,
  sessionId?: string,
  stage = typeof message.method === "string" ? message.method : "unknown",
): Promise<{ response: Response; payload: JsonRpcResponse | null; responseBodyBytes: number; responseBodyLines: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  let response: Response;
  try {
    response = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    throw new GitHubMcpError(
      "GitHub MCP network request failed",
      typeof code === "string" ? code : "GITHUB_MCP_NETWORK_ERROR",
      undefined,
      undefined,
      "network_error",
      stage,
    );
  }

  if (!response.ok) {
    // Read only the structured error code and classify its message. Never retain or log the body.
    const body = await response.text();
    const mcpError = readMcpError(body);
    throw new GitHubMcpError(
      `GitHub MCP request failed with status ${response.status}`,
      "GITHUB_MCP_HTTP_ERROR",
      response.status,
      mcpError?.code,
      classifyRemoteMessage(mcpError?.message),
      stage,
    );
  }

  if (response.status === 202 || message.method === "notifications/initialized") {
    return { response, payload: null, responseBodyBytes: 0, responseBodyLines: 0 };
  }

  const body = await response.text();
  let payload: JsonRpcResponse | null = null;
  if (body.trim()) {
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const data = body.split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);
      for (const item of data) {
        try {
          const parsed = JSON.parse(item) as JsonRpcResponse;
          if (parsed.id === message.id) payload = parsed;
        } catch {
          // Ignore non-JSON SSE event data.
        }
      }
    } else {
      payload = JSON.parse(body) as JsonRpcResponse;
    }
  }

  if (!payload) {
    throw new GitHubMcpError("GitHub MCP returned an invalid response", "GITHUB_MCP_INVALID_RESPONSE", response.status, undefined, "empty_or_unparseable_response", stage);
  }
  if (payload.error) {
    throw new GitHubMcpError(
      "GitHub MCP protocol request failed",
      "GITHUB_MCP_PROTOCOL_ERROR",
      response.status,
      payload.error.code,
      classifyRemoteMessage(payload.error.message),
      stage,
    );
  }
  return { response, payload, responseBodyBytes: Buffer.byteLength(body, "utf8"), responseBodyLines: countLines(body) };
}

async function callMcpTool(name: string, args: Record<string, unknown>, includeRepository = true): Promise<McpToolCall> {
  const init = await postMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "worktable", version: "1.0.0" },
    },
  });
  const sessionId = init.response.headers.get("Mcp-Session-Id") ?? undefined;

  await postMessage({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  }, sessionId);

  const listed = await postMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  }, sessionId);
  const availableTools = (listed.payload?.result as { tools?: Array<{ name?: unknown }> } | undefined)?.tools;
  if (!availableTools?.some((tool) => tool.name === name)) {
    throw new GitHubMcpError(
      `GitHub MCP does not expose the expected read-only tool: ${name}`,
      "GITHUB_MCP_TOOL_UNAVAILABLE",
      listed.response.status,
      undefined,
      "tool_not_listed",
      "tools/list",
    );
  }

  const result = await postMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name,
      arguments: includeRepository
        ? { ...args, owner: REPOSITORY_OWNER, repo: REPOSITORY_NAME }
        : args,
    },
  }, sessionId);

  const toolResult = result.payload?.result as McpToolResult | undefined;
  if (!toolResult || typeof toolResult !== "object") {
    throw new GitHubMcpError("GitHub MCP returned an invalid tool result", "GITHUB_MCP_INVALID_TOOL_RESULT", result.response.status, undefined, "invalid_tool_result", "tools/call");
  }
  if (toolResult.isError) {
    const errorText = (toolResult.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join(" ");
    throw new GitHubMcpError(
      "GitHub MCP tool execution failed",
      "GITHUB_MCP_TOOL_ERROR",
      result.response.status,
      undefined,
      classifyRemoteMessage(errorText),
      "tools/call",
    );
  }
  return {
    result: toolResult,
    responseBodyBytes: result.responseBodyBytes,
    responseBodyLines: result.responseBodyLines,
  };
}

function splitLines(content: string): string[] {
  if (!content) return [];
  const lines = content.split(/\r\n|\n|\r/u);
  if (/(?:\r\n|\n|\r)$/u.test(content)) lines.pop();
  return lines;
}

function countLines(content: string): number {
  return splitLines(content).length;
}

function getExpectedBlobSha(result: McpToolResult): string | null {
  for (const block of result.content ?? []) {
    if (block.type !== "text" || typeof block.text !== "string") continue;
    const match = block.text.match(/\bSHA:\s*([a-f0-9]{40})\b/iu);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

function getGitBlobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.byteLength}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

function logFileReadMetrics(event: string, details: Record<string, unknown>) {
  console.info(`${event} ${JSON.stringify(details)}`);
}

function extractResourceText(resource: McpResource | undefined): string | null {
  if (!resource) return null;
  if (typeof resource.text === "string") return resource.text;
  const mimeType = typeof resource.mimeType === "string" ? resource.mimeType : "";
  if (
    typeof resource.blob === "string" &&
    /^(text\/|application\/(json|xml|javascript|typescript|x-yaml|yaml))/iu.test(mimeType)
  ) {
    try {
      return Buffer.from(resource.blob, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}

function extractStructuredText(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => extractStructuredText(item, depth + 1));
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") return [record.text];
  if (record.type === "resource") {
    const text = extractResourceText(record.resource as McpResource | undefined);
    return text ? [text] : [];
  }

  // Only inspect fields that can carry content; ignore metadata such as SHA and file size.
  const contentKeys = ["content", "contents", "text", "body", "fileContent", "file_content", "resource", "resourceContents", "structuredContent"];
  return contentKeys.flatMap((key) => extractStructuredText(record[key], depth + 1));
}

function stringifyToolResult(result: McpToolResult, requireFileBody = false, maxLength = MAX_MCP_TEXT_LENGTH): string {
  const resources = (result.content ?? [])
    .filter((block) => block.type === "resource")
    .map((block) => extractResourceText(block.resource))
    .filter((text): text is string => text !== null);
  const isDownloadNotice = (line: string) =>
    /^successfully downloaded text file(?:\s*\(SHA:\s*[^)]*\))?\s*$/iu.test(line.trim());
  const structured = requireFileBody
    ? extractStructuredText(result.structuredContent).filter((line) => !isDownloadNotice(line))
    : [];
  const text = (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string);
  const fileBodies = resources.length > 0 ? resources : structured;
  const fileContent = fileBodies.join("\n");
  const onlyDownloadNotice = text.length > 0 && text.every(isDownloadNotice);
  const hasFileBody = fileBodies.length > 0;
  const value = requireFileBody
    ? (hasFileBody ? fileContent : onlyDownloadNotice ? "" : text.join("\n"))
    : resources.length > 0
      ? resources.join("\n")
      : text.join("\n") || (result.structuredContent ? JSON.stringify(result.structuredContent) : "");
  if (!value && !hasFileBody) {
    throw new GitHubMcpError(
      "GitHub MCP returned no readable file content",
      "GITHUB_MCP_EMPTY_CONTENT",
      undefined,
      undefined,
      "no_text_resource_or_structured_content",
      "result_formatting",
    );
  }
  return value.slice(0, maxLength);
}

function validatePath(path: unknown): string {
  if (typeof path !== "string" || path.length > 500) {
    throw new Error("Invalid repository path");
  }
  const normalized = path.trim();
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((part) => part === ".." || part === ".") ||
    normalized.includes("\0")
  ) {
    throw new Error("Invalid repository path");
  }
  return normalized;
}

function validateLineRange(startLine: unknown, endLine: unknown): { startLine?: number; endLine?: number } {
  if (startLine === undefined && endLine === undefined) return {};
  if (
    !Number.isInteger(startLine) || !Number.isInteger(endLine) ||
    (startLine as number) < 1 || (endLine as number) < (startLine as number)
  ) {
    throw new GitHubMcpError(
      "startLine and endLine must be valid 1-based line numbers with endLine >= startLine",
      "GITHUB_MCP_INVALID_LINE_RANGE",
      undefined,
      undefined,
      "invalid_line_range",
      "input_validation",
    );
  }
  const rangeLength = (endLine as number) - (startLine as number) + 1;
  if (rangeLength > MAX_FILE_RANGE_LINES) {
    throw new GitHubMcpError(
      `Requested line range exceeds ${MAX_FILE_RANGE_LINES} lines. Request a smaller range.`,
      "GITHUB_MCP_RANGE_TOO_LARGE",
      undefined,
      undefined,
      "range_line_limit",
      "input_validation",
    );
  }
  return { startLine: startLine as number, endLine: endLine as number };
}

export async function readWorktableFile(path: unknown, startLine?: unknown, endLine?: unknown): Promise<string> {
  const safePath = validatePath(path);
  const range = validateLineRange(startLine, endLine);
  const call = await callMcpTool("get_file_contents", { path: safePath });
  const content = stringifyToolResult(call.result, true, Number.POSITIVE_INFINITY);
  const lines = splitLines(content);
  const fileCharacters = content.length;
  const fileLines = lines.length;
  const expectedBlobSha = getExpectedBlobSha(call.result);
  const shaMatches = expectedBlobSha === null || getGitBlobSha(content) === expectedBlobSha;
  logFileReadMetrics("GitHub MCP file content received", {
    responseBodyBytes: call.responseBodyBytes,
    responseBodyLines: call.responseBodyLines,
    fileCharacters,
    fileLines,
    parsedCharacters: fileCharacters,
    parsedLines: fileLines,
    shaVerified: expectedBlobSha !== null,
    shaMatches: expectedBlobSha === null ? undefined : shaMatches,
    truncated: false,
  });
  if (!shaMatches) {
    throw new GitHubMcpError(
      "GitHub MCP file content did not match the Git blob SHA; no file content was returned.",
      "GITHUB_MCP_INCOMPLETE_CONTENT",
      undefined,
      undefined,
      "git_blob_sha_mismatch",
      "file_integrity_check",
    );
  }

  if (range.startLine === undefined || range.endLine === undefined) {
    if (fileCharacters > MAX_FULL_FILE_CHARACTERS) {
      const suggestedEnd = Math.min(MAX_FILE_RANGE_LINES, fileLines);
      const message = fileLines === 1 && !/[\r\n]/u.test(content)
        ? `File content is ${fileCharacters} characters and exceeds the ${MAX_FULL_FILE_CHARACTERS}-character full-read limit. This file has no line breaks to split by line; request a smaller file or a character-range feature.`
        : `The file was retrieved from GitHub but omitted from the AI tool result because it is ${fileCharacters} characters (${fileLines} lines), above the ${MAX_FULL_FILE_CHARACTERS}-character full-read limit. No file content was returned. Request github_read_file with startLine=1 and endLine=${suggestedEnd}; continue with later line ranges as needed.`;
      logFileReadMetrics("GitHub MCP file output omitted", {
        fullFileCharacters: fileCharacters,
        fullFileLines: fileLines,
        contentIncluded: false,
        complete: false,
        reason: "full_file_output_limit",
      });
      throw new GitHubMcpError(
        message,
        "GITHUB_MCP_FILE_REQUIRES_RANGE",
        undefined,
        undefined,
        "full_file_output_limit",
        "file_sizing",
      );
    }
    logFileReadMetrics("GitHub MCP file output prepared", {
      characters: fileCharacters,
      lines: fileLines,
      truncated: false,
    });
    return content;
  }

  const start = range.startLine;
  if (start > fileLines) {
    throw new GitHubMcpError(
      `startLine ${start} is beyond the file's ${fileLines} lines.`,
      "GITHUB_MCP_INVALID_LINE_RANGE",
      undefined,
      undefined,
      "start_line_beyond_eof",
      "input_validation",
    );
  }
  if (fileLines === 0) {
    throw new GitHubMcpError(
      "The file is empty and has no valid line range.",
      "GITHUB_MCP_INVALID_LINE_RANGE",
      undefined,
      undefined,
      "empty_file_line_range",
      "input_validation",
    );
  }
  const end = Math.min(range.endLine, fileLines);
  const selected = lines.slice(start - 1, end).join("\n");
  if (selected.length > MAX_FILE_RANGE_CHARACTERS) {
    const reason = start === end ? "single_line_character_limit" : "range_character_limit";
    logFileReadMetrics("GitHub MCP file range omitted", {
      fullFileCharacters: fileCharacters,
      fullFileLines: fileLines,
      startLine: start,
      endLine: end,
      rangeCharacters: selected.length,
      contentIncluded: false,
      complete: false,
      reason,
    });
    throw new GitHubMcpError(
      start === end
        ? `Line ${start} alone contains ${selected.length} characters, above the ${MAX_FILE_RANGE_CHARACTERS}-character range limit. Line ranges cannot split this line.`
        : `Lines ${start}-${end} contain ${selected.length} characters, above the ${MAX_FILE_RANGE_CHARACTERS}-character range limit. Request a narrower line range.`,
      "GITHUB_MCP_RANGE_TOO_LARGE",
      undefined,
      undefined,
      reason,
      "file_sizing",
    );
  }
  const result = `[Retrieved lines ${start}-${end} of ${fileLines}; ${fileCharacters} characters in full file. This is only the requested range.]\n${selected}`;
  logFileReadMetrics("GitHub MCP file output prepared", {
    characters: result.length,
    lines: end - start + 1,
    fullFileCharacters: fileCharacters,
    fullFileLines: fileLines,
    startLine: start,
    endLine: end,
    truncated: false,
  });
  return result;
}

export async function searchWorktableCode(query: unknown): Promise<string> {
  if (typeof query !== "string" || !query.trim() || query.length > 200) {
    throw new Error("Invalid code search query");
  }
  // Always scope search to this repository, even if the model supplies qualifiers.
  const safeQuery = query
    .replace(/\brepo\s*:\s*[^\s]+/giu, " ")
    .replace(/\borg\s*:\s*[^\s]+/giu, " ")
    .replace(/\buser\s*:\s*[^\s]+/giu, " ")
    .trim();
  if (!safeQuery) throw new Error("Invalid code search query");
  const result = await callMcpTool("search_code", {
    query: `${safeQuery} repo:${REPOSITORY_OWNER}/${REPOSITORY_NAME}`,
    perPage: 5,
  }, false);
  return stringifyToolResult(result.result);
}

export async function getWorktableRecentCommits(limit: unknown): Promise<string> {
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1)) {
    throw new Error("Invalid commit limit");
  }
  const perPage = Math.min((limit as number | undefined) ?? 5, 10);
  const result = await callMcpTool("list_commits", { perPage });
  return stringifyToolResult(result.result);
}
