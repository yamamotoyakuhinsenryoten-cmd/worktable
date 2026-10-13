import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { getWorktableRecentCommits, readWorktableFile, searchWorktableCode } from "../lib/github-mcp.ts";
import { serializeToolOutput } from "../lib/chat-tool-output.ts";

const packageJson = '{\n  "name": "worktable",\n  "dependencies": { "next": "16.3.7" }\n}';

function gitBlobSha(content) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

async function withMcpResult(toolResult, run, toolName = "get_file_contents") {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalToken = process.env.GITHUB_MCP_TOKEN;
  const requests = [];
  const diagnostics = [];
  process.env.GITHUB_MCP_TOKEN = "test-token";
  console.info = (...args) => diagnostics.push(args.join(" "));
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (request.method === "initialize") {
      return Response.json({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-03-26" } }, {
        headers: { "Mcp-Session-Id": "test-session" },
      });
    }
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (request.method === "tools/list") {
      return Response.json({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: toolName, inputSchema: { type: "object" } }] } });
    }
    if (request.method === "tools/call") {
      return Response.json({ jsonrpc: "2.0", id: request.id, result: toolResult });
    }
    throw new Error("Unexpected MCP request");
  };

  try {
    await run(requests, diagnostics);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    if (originalToken === undefined) delete process.env.GITHUB_MCP_TOKEN;
    else process.env.GITHUB_MCP_TOKEN = originalToken;
  }
}

test("github_read_file returns embedded resource text and serializes it for OpenAI", async () => {
  await withMcpResult({
    content: [
      { type: "text", text: `successfully downloaded text file (SHA: ${gitBlobSha(packageJson)})` },
      { type: "resource", resource: { uri: "repo://owner/repo/contents/package.json", mimeType: "text/plain; charset=utf-8", text: packageJson } },
    ],
  }, async (requests, diagnostics) => {
    const result = await readWorktableFile("package.json");
    const functionCallOutput = serializeToolOutput(result);

    const openAiOutput = JSON.parse(functionCallOutput);
    assert.equal(openAiOutput, packageJson);
    assert.match(openAiOutput, /"dependencies"/u);
    assert.doesNotMatch(functionCallOutput, new RegExp(gitBlobSha(packageJson), "u"));
    const diagnosticText = diagnostics.join(" ");
    assert.match(diagnosticText, /"fileCharacters":65/u);
    assert.match(diagnosticText, /"shaMatches":true/u);
    assert.doesNotMatch(diagnosticText, /test-token|abc123|packageJson|"dependencies"/u);
    const toolCall = requests.find((request) => request.method === "tools/call");
    assert.deepEqual(toolCall.params.arguments, {
      path: "package.json",
      owner: "yamamotoyakuhinsenryoten-cmd",
      repo: "worktable",
    });
  });
});

test("github_read_file reads nested structured resource content", async () => {
  await withMcpResult({
    content: [{ type: "text", text: "successfully downloaded text file (SHA: def456)" }],
    structuredContent: {
      content: [{ type: "resource", resource: { mimeType: "text/plain", text: packageJson } }],
    },
  }, async () => {
    assert.equal(await readWorktableFile("package.json"), packageJson);
  });
});

test("github_read_file rejects a SHA-only success notice as missing file content", async () => {
  await withMcpResult({
    content: [{ type: "text", text: "successfully downloaded text file (SHA: abc123)" }],
  }, async () => {
    await assert.rejects(readWorktableFile("package.json"), {
      code: "GITHUB_MCP_EMPTY_CONTENT",
      reason: "no_text_resource_or_structured_content",
    });
  });
});

test("github_read_file preserves a valid empty text resource", async () => {
  await withMcpResult({
    content: [
      { type: "text", text: `successfully downloaded text file (SHA: ${gitBlobSha("")})` },
      { type: "resource", resource: { uri: "repo://owner/repo/contents/empty.txt", mimeType: "text/plain", text: "" } },
    ],
  }, async () => {
    assert.equal(await readWorktableFile("empty.txt"), "");
  });
});

const largeFileLines = Array.from({ length: 250 }, (_, index) => `L${String(index + 1).padStart(3, "0")}:${"x".repeat(75)}`);
const largeFile = largeFileLines.join("\n");
const largeFileResult = {
  content: [
    { type: "text", text: `successfully downloaded text file (SHA: ${gitBlobSha(largeFile)})` },
    { type: "resource", resource: { mimeType: "text/plain", text: largeFile } },
  ],
};

test("large full-file reads return range guidance without claiming the file was returned", async () => {
  await withMcpResult(largeFileResult, async (_requests, diagnostics) => {
    await assert.rejects(readWorktableFile("large.txt"), (error) => {
      assert.equal(error.code, "GITHUB_MCP_FILE_REQUIRES_RANGE");
      assert.match(error.message, /250 lines/u);
      assert.match(error.message, /No file content was returned/u);
      assert.doesNotMatch(error.message, /L001/u);
      return true;
    });
    assert.match(diagnostics.join(" "), /"fileCharacters":20249/u);
    assert.match(diagnostics.join(" "), /"fileLines":250/u);
    assert.doesNotMatch(diagnostics.join(" "), /L001|test-token/u);
  });
});

test("large files return exactly the requested 1-based line range", async () => {
  await withMcpResult(largeFileResult, async () => {
    const output = await readWorktableFile("large.txt", 121, 240);
    const [header, ...bodyLines] = output.split("\n");
    assert.match(header, /^\[Retrieved lines 121-240 of 250; \d+ characters in full file\. This is only the requested range\.\]$/u);
    assert.deepEqual(bodyLines, largeFileLines.slice(120, 240));
  });
});

test("line ranges include the first and last lines", async () => {
  await withMcpResult(largeFileResult, async () => {
    const first = await readWorktableFile("large.txt", 1, 2);
    const last = await readWorktableFile("large.txt", 249, 250);
    assert.deepEqual(first.split("\n").slice(1), largeFileLines.slice(0, 2));
    assert.deepEqual(last.split("\n").slice(1), largeFileLines.slice(-2));
  });
});

test("invalid line ranges are rejected before contacting MCP", async () => {
  await withMcpResult(largeFileResult, async (requests) => {
    for (const [start, end] of [[0, 2], [3, 2], [1.5, 2], [1, undefined], [1, 121]]) {
      await assert.rejects(readWorktableFile("large.txt", start, end), {
        code: start === 1 && end === 121 ? "GITHUB_MCP_RANGE_TOO_LARGE" : "GITHUB_MCP_INVALID_LINE_RANGE",
      });
    }
    assert.equal(requests.length, 0);
  });
});

test("a response whose content does not match the Git blob SHA is rejected", async () => {
  const fullBody = "complete first line\ncomplete second line";
  const truncatedBody = "complete first line";
  await withMcpResult({
    content: [
      { type: "text", text: `successfully downloaded text file (SHA: ${gitBlobSha(fullBody)})` },
      { type: "resource", resource: { mimeType: "text/plain", text: truncatedBody } },
    ],
  }, async () => {
    await assert.rejects(readWorktableFile("truncated.txt"), {
      code: "GITHUB_MCP_INCOMPLETE_CONTENT",
      reason: "git_blob_sha_mismatch",
    });
  });
});

test("an oversized single line is never silently returned as a complete range", async () => {
  const singleLine = "x".repeat(13_000);
  await withMcpResult({
    content: [
      { type: "text", text: `successfully downloaded text file (SHA: ${gitBlobSha(singleLine)})` },
      { type: "resource", resource: { mimeType: "text/plain", text: singleLine } },
    ],
  }, async () => {
    await assert.rejects(readWorktableFile("minified.txt"), {
      code: "GITHUB_MCP_FILE_REQUIRES_RANGE",
    });
    await assert.rejects(readWorktableFile("minified.txt", 1, 1), {
      code: "GITHUB_MCP_RANGE_TOO_LARGE",
      reason: "single_line_character_limit",
    });
  });
});

test("file reads select either allowlisted repository and default to worktable", async () => {
  await withMcpResult({ content: [{ type: "resource", resource: { mimeType: "text/plain", text: packageJson } }] }, async (requests) => {
    await readWorktableFile("package.json");
    await readWorktableFile("package.json", undefined, undefined, "mountain-book-dyeshop");
    const calls = requests.filter((request) => request.method === "tools/call");
    assert.equal(calls[0].params.arguments.repo, "worktable");
    assert.equal(calls[1].params.arguments.repo, "mountain-book-dyeshop");
    assert.equal(calls.every((call) => call.params.arguments.owner === "yamamotoyakuhinsenryoten-cmd"), true);
  });
});

test("code search stays scoped to the selected allowlisted repository", async () => {
  await withMcpResult({ content: [{ type: "text", text: "matches" }] }, async (requests) => {
    await searchWorktableCode("useState repo:attacker/private", "mountain-book-dyeshop");
    const call = requests.find((request) => request.method === "tools/call");
    assert.equal(call.params.arguments.query, "useState repo:yamamotoyakuhinsenryoten-cmd/mountain-book-dyeshop");
    assert.equal("owner" in call.params.arguments, false);
    assert.equal("repo" in call.params.arguments, false);
  }, "search_code");
});

test("code search without a repository retains the worktable default", async () => {
  await withMcpResult({ content: [{ type: "text", text: "matches" }] }, async (requests) => {
    await searchWorktableCode("useState");
    const call = requests.find((request) => request.method === "tools/call");
    assert.equal(call.params.arguments.query, "useState repo:yamamotoyakuhinsenryoten-cmd/worktable");
  }, "search_code");
});

test("recent commits use the selected repository", async () => {
  await withMcpResult({ content: [{ type: "text", text: "commits" }] }, async (requests) => {
    await getWorktableRecentCommits(4, "mountain-book-dyeshop");
    const call = requests.find((request) => request.method === "tools/call");
    assert.deepEqual(call.params.arguments, {
      perPage: 4,
      owner: "yamamotoyakuhinsenryoten-cmd",
      repo: "mountain-book-dyeshop",
    });
  }, "list_commits");
});

test("recent commits without a repository retain the worktable default", async () => {
  await withMcpResult({ content: [{ type: "text", text: "commits" }] }, async (requests) => {
    await getWorktableRecentCommits(undefined);
    const call = requests.find((request) => request.method === "tools/call");
    assert.equal(call.params.arguments.repo, "worktable");
  }, "list_commits");
});

test("unlisted repositories are rejected before contacting GitHub MCP", async () => {
  await withMcpResult({ content: [{ type: "resource", resource: { mimeType: "text/plain", text: packageJson } }] }, async (requests) => {
    await assert.rejects(readWorktableFile("package.json", undefined, undefined, "attacker/private"), {
      code: "GITHUB_MCP_REPOSITORY_NOT_ALLOWED",
    });
    await assert.rejects(searchWorktableCode("test", "attacker/private"), {
      code: "GITHUB_MCP_REPOSITORY_NOT_ALLOWED",
    });
    await assert.rejects(getWorktableRecentCommits(3, "attacker/private"), {
      code: "GITHUB_MCP_REPOSITORY_NOT_ALLOWED",
    });
    assert.equal(requests.length, 0);
  });
});
