// @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
import { isAuthorizedCronRequest, runInstagramTokenRefresh } from "../../../../lib/instagram-token.ts";

export const runtime = "nodejs";

/**
 * Cron共有シークレットを検証し、条件に応じて更新を実行します。
 *
 * 1. Authorizationヘッダーを確認します。
 * 2. 不一致なら401、一致なら更新結果を返します。
 * @example GET(new Request(url, { headers: { authorization: "Bearer …" } }))
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runInstagramTokenRefresh();
  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
