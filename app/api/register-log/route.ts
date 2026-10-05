import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

type LogType = "work" | "experience" | "development";

type RegisterLogRequest = {
  content: string;
  logType: LogType;
  slug: string;
};

function getExportName(slug: string) {
  return slug.replace(/-/g, "");
}

function cleanGeneratedCode(content: string) {
  return content
    .replace(/^```(?:typescript|ts)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterLogRequest;

    const content = cleanGeneratedCode(body.content);
    const logType = body.logType;
    const slug = body.slug.trim();

    if (!content) {
      return NextResponse.json(
        {
          error: "登録するログがありません",
        },
        { status: 400 },
      );
    }

    if (!["work", "experience", "development"].includes(logType)) {
      return NextResponse.json(
        {
          error: "不正なログタイプです",
        },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        {
          error: "slugは半角英数字とハイフンのみ使用できます",
        },
        { status: 400 },
      );
    }

    const exportName = getExportName(slug);

    if (!exportName) {
      return NextResponse.json(
        {
          error: "export名を生成できません",
        },
        { status: 400 },
      );
    }

    const projectRoot = path.resolve(process.cwd(), "../mountain-book-dyeshop");

    const dataRoot = path.join(projectRoot, "data", "logs");
    const typeDirectory = path.join(dataRoot, logType);
    const logFilePath = path.join(typeDirectory, `${slug}.ts`);
    const indexPath = path.join(dataRoot, "index.ts");

    const indexContent = await fs.readFile(indexPath, "utf8");

    // 既存ファイルがある場合は上書きしない
    try {
      await fs.access(logFilePath);

      return NextResponse.json(
        {
          error: `すでに ${slug}.ts が存在します`,
        },
        { status: 409 },
      );
    } catch {
      // ファイルが存在しないので続行
    }

    // index.ts に同じimportがある場合も登録しない
    const importLine = `import { ${exportName} } from "./${logType}/${slug}";`;

    if (indexContent.includes(importLine)) {
      return NextResponse.json(
        {
          error: `index.ts に ${slug} のimportがすでに存在します`,
        },
        { status: 409 },
      );
    }

    // 生成されたTSファイルを作成
    await fs.mkdir(typeDirectory, { recursive: true });
    await fs.writeFile(logFilePath, `${content}\n`, "utf8");

    // index.ts の import を追加
    const importMarker = 'import { Log } from "./types";';

    if (!indexContent.includes(importMarker)) {
      return NextResponse.json(
        {
          error: 'index.ts に import { Log } from "./types"; が見つかりません',
        },
        { status: 500 },
      );
    }

    let updatedIndex = indexContent.replace(
      importMarker,
      `${importLine}\n\n${importMarker}`,
    );

    // logs 配列の最後にexport名を追加
    const logsArrayEnd = "\n];";

    const lastIndex = updatedIndex.lastIndexOf(logsArrayEnd);

    if (lastIndex === -1) {
      return NextResponse.json(
        {
          error: "index.ts の logs 配列が見つかりません",
        },
        { status: 500 },
      );
    }

    updatedIndex =
      updatedIndex.slice(0, lastIndex) +
      `\n  ${exportName},` +
      updatedIndex.slice(lastIndex);

    await fs.writeFile(indexPath, updatedIndex, "utf8");

    return NextResponse.json({
      success: true,
      file: `data/${logType}/${slug}.ts`,
      exportName,
    });
  } catch (error) {
    console.error("Log registration error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "サイトへの登録に失敗しました",
      },
      { status: 500 },
    );
  }
}
