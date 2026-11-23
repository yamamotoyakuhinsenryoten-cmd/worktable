import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "../lib/crypto.ts";
import { isAuthorizedCronRequest, refreshInstagramToken, shouldRefreshToken } from "../lib/instagram-token.ts";
import { GET as cronGet } from "../app/api/cron/refresh-instagram-token/route.ts";

process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");

test("R-01 encrypts and decrypts tokens and rejects a changed ciphertext", () => {
  const encrypted = encryptSecret("test-token-value");
  assert.equal(decryptSecret(encrypted), "test-token-value");
  const parts = encrypted.split(".");
  parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
  assert.throws(() => decryptSecret(parts.join(".")));
});

test("R-04 rejects missing and invalid authorization headers", () => {
  assert.equal(isAuthorizedCronRequest(null, "expected"), false);
  assert.equal(isAuthorizedCronRequest("Bearer wrong", "expected"), false);
  assert.equal(isAuthorizedCronRequest("Bearer expected", "expected"), true);
});

test("R-04 cron route returns 401 for missing and invalid authorization headers", async () => {
  process.env.CRON_SECRET = "expected";
  for (const authorization of [null, "Bearer wrong"]) {
    const request = new Request("https://example.test/api/cron/refresh-instagram-token", {
      headers: authorization ? { authorization } : {},
    });
    assert.equal((await cronGet(request)).status, 401);
  }
});

test("R-07 keeps the stored value when the refresh API fails", async () => {
  const original = encryptSecret("old-token");
  let stored = original;
  const result = await refreshInstagramToken({
    load: async () => ({ value: stored, updated_at: new Date("2026-01-01T00:00:00Z") }),
    save: async (value) => { stored = encryptSecret(value); },
    refresh: async () => { throw new Error("refresh failed"); },
    notify: async () => {},
    now: new Date("2026-02-01T00:00:00Z"),
  });
  assert.equal(result.status, "failed");
  assert.equal(stored, original);
});

test("R-15 refreshes at 31 days but skips at 29 days", async () => {
  const now = new Date("2026-11-24T00:00:00Z");
  assert.equal(shouldRefreshToken(new Date(now.getTime() - 29 * 86400000), now), false);
  assert.equal(shouldRefreshToken(new Date(now.getTime() - 31 * 86400000), now), true);
  let refreshCount = 0;
  const dependencies = (days) => refreshInstagramToken({
    load: async () => ({ value: encryptSecret("old-token"), updated_at: new Date(now.getTime() - days * 86400000) }),
    save: async () => {},
    refresh: async () => { refreshCount++; return "new-token"; },
    notify: async () => {},
    now,
  });
  assert.equal((await dependencies(29)).status, "skipped");
  assert.equal((await dependencies(31)).status, "updated");
  assert.equal(refreshCount, 1);
});

test("R-17 keeps stored value and sends failure notification when saving fails", async () => {
  const original = encryptSecret("old-token");
  let stored = original;
  const notices = [];
  const result = await refreshInstagramToken({
    load: async () => ({ value: stored, updated_at: new Date("2026-01-01T00:00:00Z") }),
    save: async () => { throw new Error("database write failed"); },
    refresh: async () => "new-token",
    notify: async (success, detail) => { notices.push({ success, detail }); },
    now: new Date("2026-02-01T00:00:00Z"),
  });
  assert.equal(result.status, "failed");
  assert.equal(stored, original);
  assert.deepEqual(notices, [{ success: false, detail: "Instagramトークンの更新または保存に失敗しました" }]);
});
