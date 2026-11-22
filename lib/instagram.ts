export type InstagramLog = {
  slug: string;
  type: "work" | "experience" | "development";
  category: string;
  title: string;
  details: { label: string; value: string }[];
  insights: string[];
  media: { type: string; src: string; caption?: string }[];
};

const FIXED_TAGS: Record<string, string[]> = {
  焙煎: ["#コーヒー焙煎", "#自家焙煎", "#手鍋焙煎", "#コーヒー好き"],
  縫物: ["#手作り", "#ハンドメイド", "#手縫い", "#縫い物"],
  染物: ["#草木染め", "#手染め", "#染め物"],
  コーヒー店: ["#カフェ巡り", "#コーヒー好き", "#コーヒー店巡り"],
  コーヒー豆: ["#コーヒー豆", "#スペシャルティコーヒー", "#コーヒー好き"],
};

function detailValue(log: Pick<InstagramLog, "details">, label: string) {
  return log.details.find((detail) => detail.label === label)?.value ?? "";
}

function cleanTagValue(value: string) {
  return value.trim().replace(/[\p{P}\p{S}\s]/gu, "");
}

function dynamicTagValues(log: Pick<InstagramLog, "category" | "title" | "details">) {
  switch (log.category) {
    case "焙煎":
      return ["産地", "農園", "グレード", "焙煎度"].map((label) => detailValue(log, label));
    case "縫物":
      return ["制作物", "対象"].map((label) => detailValue(log, label));
    case "染物":
      return [log.title.split(" #", 1)[0], detailValue(log, "染めたものの材質")];
    case "コーヒー店": {
      const place = detailValue(log, "店名");
      const split = place.search(/[＠@(（]/);
      return split < 0 ? [place] : [place.slice(0, split), place.slice(split + 1)];
    }
    case "コーヒー豆":
      return [...detailValue(log, "産地").split("、"), detailValue(log, "焙煎度")];
    default:
      return [];
  }
}

function buildTags(log: Pick<InstagramLog, "type" | "category" | "title" | "details">) {
  if (log.type === "development") return [];
  const fixed = FIXED_TAGS[log.category] ?? [];
  const tags = [...fixed];
  const seen = new Set(fixed.map((tag) => tag.slice(1).toLocaleLowerCase()));
  for (const value of dynamicTagValues(log)) {
    const cleaned = cleanTagValue(value);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    tags.push(`#${cleaned}`);
  }
  return [...fixed, ...tags.slice(fixed.length, 30)];
}

export function buildInstagramCaption(log: Pick<InstagramLog, "type" | "category" | "title" | "details" | "insights">) {
  const details = log.details
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join("\n");
  const insights = log.insights.length
    ? `\n\n${log.insights.map((insight) => `・${insight}`).join("\n")}`
    : "";

  const caption = `${log.title}\n\n${details}${insights}`;
  const tags = buildTags(log);
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption;
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
