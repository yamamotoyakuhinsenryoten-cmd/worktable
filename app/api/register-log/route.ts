import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { CATEGORY_FIELDS, LOG_CATEGORIES, validateLogDraft, type LogType } from "@/lib/log-schema";

function getExportName(slug: string) { return slug.replace(/-/g, ""); }
function literal(value: unknown): string { return JSON.stringify(value, null, 2); }

function makeTypescript(draft: Record<string, unknown>, type: LogType) {
  const value: Record<string, unknown> = { ...draft, media: [], source: { title: "生成元チャット", service: "Worktable", url: "" } };
  const typeName = type === "development" ? "DevelopmentLog" : "Log";
  return `import type { ${typeName} } from "../types";\n\nexport const ${getExportName(String(value.slug))} = ${literal(value)} satisfies ${typeName};`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { draft?: unknown; overwrite?: boolean };
    const draft = body.draft;
    if (!validateLogDraft(draft)) return NextResponse.json({ error: "ログの入力値が不正です" }, { status: 400 });
    const logType = draft.type as LogType;
    const slug = draft.slug.trim();
    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "slugは半角英数字とハイフンのみ使用できます" }, { status: 400 });
    if (!LOG_CATEGORIES[logType].includes(draft.category)) return NextResponse.json({ error: "カテゴリが不正です" }, { status: 400 });
    if (logType !== "development") {
      const fields = CATEGORY_FIELDS[logType][draft.category];
      const supplied = draft.details ?? [];
      if (fields.length !== supplied.length || fields.some(({ label }, i) => supplied[i]?.label !== label || typeof supplied[i]?.value !== "string")) return NextResponse.json({ error: "カテゴリに対応した詳細項目をすべて入力してください" }, { status: 400 });
    }

    const projectRoot = path.resolve(process.cwd(), "../mountain-book-dyeshop");
    const dataRoot = path.join(projectRoot, "data", "logs");
    const logFilePath = path.join(dataRoot, logType, `${slug}.ts`);
    const indexPath = path.join(dataRoot, "index.ts");
    let indexContent = await fs.readFile(indexPath, "utf8");
    const exportName = getExportName(slug);
    const importLine = `import { ${exportName} } from "./${logType}/${slug}";`;
    const exists = await fs.access(logFilePath).then(() => true, () => false);
    if (exists && !body.overwrite) return NextResponse.json({ error: `${slug}.ts はすでに存在します。上書きしますか？`, conflict: true }, { status: 409 });
    const alreadyImported = indexContent.includes(importLine);
    if (!exists && alreadyImported) return NextResponse.json({ error: `index.ts に ${slug} のimportがすでに存在します` }, { status: 409 });
    const importMarker = 'import { Log } from "./types";';
    if (!alreadyImported && !indexContent.includes(importMarker)) return NextResponse.json({ error: 'index.ts に import { Log } from "./types"; が見つかりません' }, { status: 500 });
    if (!alreadyImported) {
      indexContent = indexContent.replace(importMarker, `${importLine}\n\n${importMarker}`);
      const logsArrayEnd = "\n];";
      const end = indexContent.lastIndexOf(logsArrayEnd);
      if (end === -1) return NextResponse.json({ error: "index.ts の logs 配列が見つかりません" }, { status: 500 });
      indexContent = `${indexContent.slice(0, end)}\n  ${exportName},${indexContent.slice(end)}`;
    }
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    await fs.writeFile(logFilePath, `${makeTypescript(draft as Record<string, unknown>, logType)}\n`, "utf8");
    if (!alreadyImported) await fs.writeFile(indexPath, indexContent, "utf8");
    return NextResponse.json({ success: true, file: `data/${logType}/${slug}.ts`, exportName });
  } catch (error) {
    console.error("Log registration error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "サイトへの登録に失敗しました" }, { status: 500 });
  }
}
