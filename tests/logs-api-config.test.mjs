import assert from "node:assert/strict";
import test from "node:test";
import { parseLogsApiBaseUrl } from "../lib/logs-api-config.ts";

test("allows the local dye shop API over HTTP only in development", () => {
  assert.equal(parseLogsApiBaseUrl("http://localhost:3001", "development")?.origin, "http://localhost:3001");
});

test("continues to allow HTTPS API URLs", () => {
  assert.equal(parseLogsApiBaseUrl("https://logs.example.com", "development")?.protocol, "https:");
  assert.equal(parseLogsApiBaseUrl("https://logs.example.com", "production")?.protocol, "https:");
});

test("rejects HTTP URLs outside the explicitly allowed local origin", () => {
  for (const url of ["http://example.com", "http://127.0.0.1:3001", "http://localhost:3000", "http://localhost:3001.evil.test"]) {
    assert.equal(parseLogsApiBaseUrl(url, "development"), null);
  }
});

test("rejects localhost HTTP outside development", () => {
  assert.equal(parseLogsApiBaseUrl("http://localhost:3001", "production"), null);
});

test("rejects URL usernames and passwords for both protocols", () => {
  for (const [url, environment] of [
    ["https://user:password@logs.example.com", "production"],
    ["http://user:password@localhost:3001", "development"],
  ]) {
    assert.equal(parseLogsApiBaseUrl(url, environment), null);
  }
});
