import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_DOCUMENT_BYTES = 100_000;
const MAX_TOTAL_BYTES = 150_000;

const PROJECT_DOCUMENTS = [
  { fileName: "design.md", title: "現在の仕様・要件・設計" },
  { fileName: "dev_history.md", title: "実装の経緯・過去の判断" },
] as const;

export type WebsiteDevelopmentDocument = (typeof PROJECT_DOCUMENTS)[number] & {
  content: string;
};

export type WebsiteDevelopmentContext = {
  documents: WebsiteDevelopmentDocument[];
  unavailable: string[];
};

export async function getWebsiteDevelopmentContext(): Promise<WebsiteDevelopmentContext> {
  const documents: WebsiteDevelopmentDocument[] = [];
  const unavailable: string[] = [];
  let totalBytes = 0;

  for (const document of PROJECT_DOCUMENTS) {
    try {
      const content = await readFile(
        join(process.cwd(), "project-context", "website-development", "docs", document.fileName),
        "utf8",
      );
      const bytes = Buffer.byteLength(content, "utf8");
      if (!content.trim()) {
        unavailable.push(document.fileName);
        continue;
      }
      if (bytes > MAX_DOCUMENT_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) {
        unavailable.push(document.fileName);
        continue;
      }
      totalBytes += bytes;
      documents.push({ ...document, content });
    } catch {
      unavailable.push(document.fileName);
    }
  }

  return { documents, unavailable };
}
