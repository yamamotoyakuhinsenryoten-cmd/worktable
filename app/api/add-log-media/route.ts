import { readFile, writeFile } from "fs/promises";
import path from "path";

import { downloadLogMedia } from "@/lib/log-media/downloadLogMedia";
import { generateLogMedia } from "@/lib/log-media/generateLogMedia";
import { findMediaArrayStart } from "@/lib/log-media/findMediaArrayStart";
import { safeExternalError } from "@/lib/instagram";
import { isLogFilePresent } from "@/lib/log-file";

export const runtime = "nodejs";
const projectRoot = path.resolve(
  process.cwd(),
  "../mountain-book-dyeshop",
);

const validLogTypes = ["work", "experience", "development"] as const;
const activeRequests = new Set<string>();

export async function POST(request: Request) {
  try {
    const { slug, logType } = await request.json();

    if (!slug || !logType) {
      return Response.json(
        {
          error: "slugとlogTypeを指定してください",
        },
        { status: 400 },
      );
    }

    if (!validLogTypes.includes(logType)) {
      return Response.json(
        {
          error: "不正なlogTypeです",
        },
        { status: 400 },
      );
    }

    if (typeof slug !== "string" || !slug.trim()) {
      return Response.json({ error: "ログが登録されていません" }, { status: 404 });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(slug)) {
      return Response.json({ error: "slugの指定が不正です" }, { status: 400 });
    }

    const requestKey = `${logType}:${slug}`;
    if (activeRequests.has(requestKey)) {
      return Response.json({ error: "メディアの追加を処理中です" }, { status: 409 });
    }
    activeRequests.add(requestKey);

    try {
    const filePath = path.join(
      projectRoot,
      "data",
      "logs",
      logType,
      `${slug}.ts`,
    );
    if (!(await isLogFilePresent(filePath))) {
      return Response.json({ error: "ログが登録されていません" }, { status: 404 });
    }

    const files = await downloadLogMedia(slug);
    if (!files.some((file) => file.type === "image")) {
      return Response.json({ error: "追加する画像がありません" }, { status: 400 });
    }

    const media = generateLogMedia(slug, files);

    let code = await readFile(filePath, "utf-8");

    const mediaCode = media
      .map(
        (item) => `    {
      type: "${item.type}",
      src: "${item.src}",
      caption: "${item.caption}",
    }`,
      )
      .join(",\n");

    const mediaBlock = `media: [\n${mediaCode}\n  ]`;

    // media: [ ... ] の開始位置を探す
    const mediaStart = findMediaArrayStart(code);

    if (mediaStart === -1) {
      throw new Error("ログTSにmedia配列が見つかりませんでした");
    }

    // media配列の "[" を取得
    const arrayStart = code.indexOf("[", mediaStart);

    if (arrayStart === -1) {
      throw new Error("media配列の開始位置が見つかりませんでした");
    }

    // ネストした [] も考慮して、media配列の対応する "]" を探す
    let depth = 0;
    let mediaEnd = -1;

    for (let i = arrayStart; i < code.length; i++) {
      if (code[i] === "[") {
        depth++;
      } else if (code[i] === "]") {
        depth--;

        if (depth === 0) {
          mediaEnd = i + 1;
          break;
        }
      }
    }

    if (mediaEnd === -1) {
      throw new Error("media配列の終端が見つかりませんでした");
    }

    // media配列だけを置換する
    const before = code.slice(0, mediaStart);
    const after = code.slice(mediaEnd);

    code = `${before}${mediaBlock}${after}`;

    await writeFile(filePath, code, "utf-8");

    return Response.json({
      success: true,
      media,
      filePath,
    });
    } finally {
      activeRequests.delete(requestKey);
    }
  } catch (error) {
    console.error("Add log media error:", error instanceof Error ? error.name : "unknown");

    return Response.json(
      {
        error:
          safeExternalError(error, [process.env.INSTAGRAM_ACCESS_TOKEN ?? "", process.env.R2_SECRET_ACCESS_KEY ?? ""]),
      },
      { status: 500 },
    );
  }
}
