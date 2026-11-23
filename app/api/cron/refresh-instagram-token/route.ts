// @ts-expect-error Node's native TypeScript execution requires explicit source extensions.
import { isAuthorizedCronRequest, runInstagramTokenRefresh } from "../../../../lib/instagram-token.ts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runInstagramTokenRefresh();
  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
