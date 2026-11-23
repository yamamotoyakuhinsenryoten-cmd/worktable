import "dotenv/config";
// @ts-expect-error Native Node TypeScript execution requires the explicit source extension.
import { encryptSecret } from "../lib/crypto.ts";
import { neon } from "@neondatabase/serverless";

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
