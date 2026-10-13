const MCP_ENDPOINT = "https://api.githubcopilot.com/mcp/readonly";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const REPOSITORY_OWNER = "yamamotoyakuhinsenryoten-cmd";
const REPOSITORY_NAME = "worktable";
const MAX_MCP_TEXT_LENGTH = 20_000;

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
};

type McpContentBlock = { type?: string; text?: string };
type McpToolResult = {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
};

function getToken(): string {
  const token = process.env.GITHUB_MCP_TOKEN;
  if (!token) throw new Error("GitHub MCP is not configured");
  return token;
}

async function postMessage(
  message: Record<string, unknown>,
  sessionId?: string,
): Promise<{ response: Response; payload: JsonRpcResponse | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    // Do not include response bodies or authorization headers in errors/logs.
    throw new Error(`GitHub MCP request failed with status ${response.status}`);
  }

  if (response.status === 202 || message.method === "notifications/initialized") {
    return { response, payload: null };
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

  if (!payload) throw new Error("GitHub MCP returned an empty response");
  if (payload.error) {
    throw new Error(`GitHub MCP protocol error (${payload.error.code ?? "unknown"})`);
  }
  return { response, payload };
}

async function callMcpTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
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

  const result = await postMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name,
      arguments: {
        owner: REPOSITORY_OWNER,
        repo: REPOSITORY_NAME,
        ...args,
      },
    },
  }, sessionId);

  const toolResult = result.payload?.result as McpToolResult | undefined;
  if (!toolResult || typeof toolResult !== "object") {
    throw new Error("GitHub MCP returned an invalid tool result");
  }
  if (toolResult.isError) {
    throw new Error("GitHub MCP tool execution failed");
  }
  return toolResult;
}

function stringifyToolResult(result: McpToolResult): string {
  const text = (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
  const value = text || (result.structuredContent ? JSON.stringify(result.structuredContent) : "");
  if (!value) return "GitHub returned no readable content.";
  return value.slice(0, MAX_MCP_TEXT_LENGTH);
}

function validatePath(path: unknown): string {
  if (typeof path !== "string" || path.length > 500) {
    throw new Error("Invalid repository path");
  }
  const normalized = path.trim();
  if (
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((part) => part === ".." || part === ".") ||
    normalized.includes("\0")
  ) {
    throw new Error("Invalid repository path");
  }
  return normalized;
}

export async function readWorktableFile(path: unknown): Promise<string> {
  const safePath = validatePath(path);
  const result = await callMcpTool("get_file_contents", { path: safePath });
  return stringifyToolResult(result);
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
  });
  return stringifyToolResult(result);
}

export async function getWorktableRecentCommits(limit: unknown): Promise<string> {
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1)) {
    throw new Error("Invalid commit limit");
  }
  const perPage = Math.min((limit as number | undefined) ?? 5, 10);
  const result = await callMcpTool("list_commits", { perPage });
  return stringifyToolResult(result);
}
