import "dotenv/config";
// @ts-expect-error Native Node TypeScript execution requires the explicit source extension.
import { encryptSecret } from "../lib/crypto.ts";
import { neon } from "@neondatabase/serverless";

/**
 * 環境変数の初期トークンを暗号化してDBへUPSERTします。
 *
 * 1. 接続先と初期トークンの有無を確認します。
 * 2. トークンを暗号化し、保存時刻とともに登録します。
 * @example initializeInstagramToken() // => 1回限りの初期投入
 */
async function initializeInstagramToken() {
  const databaseUrl = process.env.DATABASE_URL;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!databaseUrl || !token) throw new Error("初回投入に必要な設定がありません");
  const sql = neon(databaseUrl);
  const encrypted = encryptSecret(token);
  await sql`INSERT INTO app_secrets (name, value, updated_at) VALUES ('instagram_access_token', ${encrypted}, NOW()) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
}

initializeInstagramToken().catch(() => {
  console.error("Instagramトークンの初回投入に失敗しました");
  process.exitCode = 1;
});
