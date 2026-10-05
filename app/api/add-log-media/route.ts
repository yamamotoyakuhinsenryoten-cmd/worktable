import { readFile, writeFile } from "fs/promises";
import path from "path";

import { downloadLogMedia } from "@/lib/log-media/downloadLogMedia";
import { generateLogMedia } from "@/lib/log-media/generateLogMedia";

export const runtime = "nodejs";
const projectRoot = path.resolve(
  process.cwd(),
  "../mountain-book-dyeshop",
);

const validLogTypes = ["work", "experience", "development"] as const;

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

    const files = await downloadLogMedia(slug);

    const media = generateLogMedia(slug, files);

    const filePath = path.join(
      projectRoot,
      "data",
      "logs",
      logType,
      `${slug}.ts`,
    );

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
    const mediaStart = code.indexOf("media: [");

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
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "メディアの追加に失敗しました",
      },
      { status: 500 },
    );
  }
}
