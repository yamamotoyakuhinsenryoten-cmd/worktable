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

/**
 * 判定時刻から30日以上が経過したかを返します。
 *
 * 1. 保存時刻と判定時刻をミリ秒に変換します。
 * 2. 経過時間が30日以上ならtrueを返します。
 * @example shouldRefreshToken("2026-10-01T00:00:00Z", new Date("2026-10-31T00:00:00Z")) // => true
 */
export function shouldRefreshToken(updatedAt: Date | string, now = new Date()) {
  return now.getTime() - new Date(updatedAt).getTime() >= THIRTY_DAYS_MS;
}

/**
 * Instagramトークンと保存日時をDBから取得します。
 *
 * 1. アプリ用DB接続を読み込みます。
 * 2. トークン行を検索し、未登録ならnullを返します。
 * @example await loadToken() // => { value, updated_at } | null
 */
async function loadToken(): Promise<TokenRow | null> {
  // @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
  const { sql } = await import("./db.ts");
  const rows = await sql`SELECT value, updated_at FROM app_secrets WHERE name = ${SECRET_NAME} LIMIT 1`;
  return (rows[0] as TokenRow | undefined) ?? null;
}

/**
 * トークンを暗号化し、DBの既存行を一度のUPSERTで置き換えます。
 *
 * 1. 新しいトークンを暗号化します。
 * 2. 値と更新時刻を同じSQL文で保存します。
 * @example await saveToken("new-token") // => undefined
 */
async function saveToken(token: string) {
  const encrypted = encryptSecret(token);
  // @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
  const { sql } = await import("./db.ts");
  await sql`INSERT INTO app_secrets (name, value, updated_at) VALUES (${SECRET_NAME}, ${encrypted}, NOW()) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
}

/**
 * Instagram Graph API v24.0へ現在のトークンを渡して更新します。
 *
 * 1. refresh用URLにgrant typeとトークンを設定します。
 * 2. API応答を検証し、新しいトークンを返します。
 * @example await refreshToken("current-token") // => "refreshed-token"
 */
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

/**
 * 保存済みトークンを条件に応じて更新し、結果を通知します。
 *
 * 1. トークン行を読み、30日未満なら終了します。
 * 2. 復号した値をrefresh APIに渡し、新しい値を保存します。
 * 3. 結果を通知し、通知エラーは更新処理から切り離します。
 * @example await refreshInstagramToken(dependencies) // => { status: "skipped" }
 */
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

/**
 * 通知を試み、メール障害を呼び出し元へ伝えないようにします。
 *
 * 1. 成否と短い説明を通知関数へ渡します。
 * 2. 通知側の例外を捕捉して処理を戻します。
 * @example await sendNotification(notify, false, "更新失敗") // => undefined
 */
async function sendNotification(notify: RefreshDependencies["notify"], success: boolean, detail: string) {
  try { await notify(success, detail); } catch { /* 通知失敗でDB更新結果を変えない */ }
}

/**
 * 保存済みのInstagramトークンを復号して呼び出し元へ返します。
 *
 * 1. トークン行をDBから読み込みます。
 * 2. 未登録なら失敗し、登録済みなら値を復号します。
 * @example await getInstagramToken() // => "current-token"
 */
export function getInstagramToken() {
  return loadToken().then((row) => {
    if (!row) throw new Error("Instagramトークンが登録されていません");
    return decryptSecret(row.value);
  });
}

/**
 * 本番依存を使ってInstagramトークン更新処理を実行します。
 *
 * 1. DB読み書き、Instagram API、メール通知を接続します。
 * 2. 共有更新処理の結果を返します。
 * @example await runInstagramTokenRefresh() // => { status: "updated" }
 */
export async function runInstagramTokenRefresh() {
  return refreshInstagramToken({
    load: loadToken,
    save: saveToken,
    refresh: refreshToken,
    notify: sendTokenRefreshEmail,
  });
}

/**
 * Cron共有シークレットとAuthorizationヘッダーが一致するかを確認します。
 *
 * 1. Bearer形式のヘッダーを解析します。
 * 2. 期待値が存在し、トークンが一致する場合だけtrueを返します。
 * @example isAuthorizedCronRequest("Bearer secret", "secret") // => true
 */
export function isAuthorizedCronRequest(header: string | null, secret: string | undefined) {
  return Boolean(secret && header === `Bearer ${secret}`);
}
