export type InstagramLog = {
  slug: string;
  type: "work" | "experience";
  title: string;
  details: { label: string; value: string }[];
  insights: string[];
  media: { type: string; src: string; caption?: string }[];
};

export function buildInstagramCaption(log: Pick<InstagramLog, "title" | "details" | "insights">) {
  const details = log.details
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join("\n");
  const insights = log.insights.length
    ? `\n\n${log.insights.map((insight) => `・${insight}`).join("\n")}`
    : "";

  return `${log.title}\n\n${details}${insights}`;
}

export function selectInstagramImages<T extends { type: string }>(media: T[]) {
  const images = media.filter((item) => item.type === "image");
  return { images: images.slice(0, 10), totalImageCount: images.length };
}

export function safeExternalError(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : "不明なエラー";
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[非表示]");
  }
  return message.replace(/access_token[=:][^&\s"']+/gi, "access_token=[非表示]");
}
