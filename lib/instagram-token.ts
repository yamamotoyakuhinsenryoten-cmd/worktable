// @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
import { decryptSecret, encryptSecret } from "./crypto.ts";
// @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
import { sendTokenRefreshEmail } from "./mail.ts";

const SECRET_NAME = "instagram_access_token";
const GRAPH_URL = "https://graph.instagram.com/v24.0/refresh_access_token";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type TokenRow = { value: string; updated_at: Date | string };
type RefreshDependencies = {
  load: () => Promise<TokenRow | null>;
  save: (token: string) => Promise<void>;
  refresh: (token: string) => Promise<string>;
  notify: (success: boolean, detail: string) => Promise<void>;
  now?: Date;
};

export function shouldRefreshToken(updatedAt: Date | string, now = new Date()) {
  return now.getTime() - new Date(updatedAt).getTime() >= THIRTY_DAYS_MS;
}

async function loadToken(): Promise<TokenRow | null> {
  // @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
  const { sql } = await import("./db.ts");
  const rows = await sql`SELECT value, updated_at FROM app_secrets WHERE name = ${SECRET_NAME} LIMIT 1`;
  return (rows[0] as TokenRow | undefined) ?? null;
}

async function saveToken(token: string) {
  const encrypted = encryptSecret(token);
  // @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
  const { sql } = await import("./db.ts");
  await sql`INSERT INTO app_secrets (name, value, updated_at) VALUES (${SECRET_NAME}, ${encrypted}, NOW()) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
}

async function refreshToken(token: string) {
  const url = new URL(GRAPH_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof data?.access_token !== "string") {
    throw new Error(`Instagram refresh APIがHTTP ${response.status}を返しました`);
  }
  return data.access_token;
}

export async function refreshInstagramToken(dependencies: RefreshDependencies) {
  const notifySafely = (success: boolean, detail: string) => sendNotification(dependencies.notify, success, detail);
  let row: TokenRow | null;
  try {
    row = await dependencies.load();
    if (!row) throw new Error("Instagramトークンが登録されていません");
    if (!shouldRefreshToken(row.updated_at, dependencies.now)) return { status: "skipped" as const };
    const currentToken = decryptSecret(row.value);
    const newToken = await dependencies.refresh(currentToken);
    await dependencies.save(newToken);
  } catch {
    await notifySafely(false, "Instagramトークンの更新または保存に失敗しました");
    return { status: "failed" as const };
  }
  await notifySafely(true, "Instagramトークンを更新しました");
  return { status: "updated" as const };
}

async function sendNotification(notify: RefreshDependencies["notify"], success: boolean, detail: string) {
  try { await notify(success, detail); } catch { /* 通知失敗でDB更新結果を変えない */ }
}

export function getInstagramToken() {
  return loadToken().then((row) => {
    if (!row) throw new Error("Instagramトークンが登録されていません");
    return decryptSecret(row.value);
  });
}

export async function runInstagramTokenRefresh() {
  return refreshInstagramToken({
    load: loadToken,
    save: saveToken,
    refresh: refreshToken,
    notify: sendTokenRefreshEmail,
  });
}

export function isAuthorizedCronRequest(header: string | null, secret: string | undefined) {
  return Boolean(secret && header === `Bearer ${secret}`);
}
