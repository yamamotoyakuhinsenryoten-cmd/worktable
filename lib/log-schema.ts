export type LogType = "work" | "experience" | "development";
export type RelatedItem =
  | { kind: "external"; title: string; url: string }
  | { kind: "log"; title: string; slug: string }
  | { kind: "backlog"; title: string; id: string };
export type LogDraft = Record<string, unknown> & {
  slug: string; type: LogType; createdAt: string; title: string; category: string;
  details?: { label: string; value: string }[]; insights?: string[]; next?: string[];
  approach?: string; result?: string; purpose?: string; policy?: string;
  steps?: string[]; execution?: { title: string; body: string }[];
  related: RelatedItem[];
};

export const CATEGORY_FIELDS: Record<LogType, Record<string, { label: string; group: string; options?: string[] }[]>> = {
  work: {
    焙煎: [
      ...["焙煎日", "焙煎前", "焙煎後", "減少率", "豆", "産地", "農園", "品種", "精製方法", "標高", "グレード", "ハンドピック前", "ハンドピック後", "除去", "欠点豆率", "欠点豆数", "欠点豆内訳", "投入温度", "火力変更", "1ハゼ", "2ハゼ", "終了"].map((label, i) => ({ label, group: i < 6 ? "基本・豆" : i < 17 ? "豆・ハンドピック" : "焙煎" })),
      { label: "焙煎手法", group: "基本", options: ["手鍋", "土鍋", "焙煎機"] },
      { label: "焙煎度", group: "基本", options: ["浅煎り", "中浅煎り", "中煎り", "中深煎り", "深煎り"] },
    ],
    縫物: [
      { label: "制作物", group: "基本" }, { label: "対象", group: "基本", options: ["男性", "女性", "子ども"] },
      { label: "作品カテゴリ", group: "基本", options: ["服", "バッグ・袋物", "寝具", "その他"] },
      { label: "生地", group: "基本" }, { label: "その他材料", group: "基本" },
      { label: "制作方法", group: "基本", options: ["手縫い", "ミシン", "手縫い（一部ミシン）", "ミシン（一部手縫い）"] }, { label: "制作期間", group: "基本" },
    ],
    染物: [
      { label: "染めた日", group: "基本" }, { label: "染めたもの", group: "基本" }, { label: "染めたものの材質", group: "基本" },
      { label: "下処理", group: "下処理" }, { label: "染液", group: "染色" }, { label: "染色時間", group: "染色" }, { label: "重ね染め", group: "染色" }, { label: "媒染", group: "媒染" },
    ],
  },
  experience: {
    コーヒー店: [
      { label: "店名", group: "基本" }, { label: "訪問日時", group: "基本" }, { label: "オーダー", group: "基本" }, { label: "豆", group: "コーヒー" }, { label: "精製方法", group: "コーヒー" }, { label: "標高", group: "コーヒー" }, { label: "テイスティングノート", group: "コーヒー" }, { label: "ドリップ方法", group: "コーヒー" },
      { label: "店カテゴリ", group: "店", options: ["ロースタリー", "カフェ", "喫茶店", "コーヒースタンド", "その他"] }, { label: "店の規模", group: "店", options: ["小", "中", "大"] },
      ...["豆の販売", "店内利用", "テイクアウト"].map(label => ({ label, group: "店", options: ["あり", "なし"] })), { label: "メニュー", group: "店" },
    ],
    コーヒー豆: [
      { label: "名前", group: "基本" }, { label: "購入店", group: "基本" }, { label: "価格", group: "基本" }, { label: "ブレンド", group: "基本", options: ["ブレンド", "シングルオリジン"] }, ...["産地", "農園", "品種", "精製方法", "標高", "グレード"].map(label => ({ label, group: "基本" })), { label: "焙煎度", group: "基本", options: ["浅煎り", "中浅煎り", "中煎り", "中深煎り", "深煎り"] }, { label: "好みの抽出方法", group: "抽出" },
    ],
  },
  development: {
    AI: [], "Webサイト構築": [],
  },
};

export const LOG_CATEGORIES: Record<LogType, string[]> = { work: ["焙煎", "縫物", "染物"], experience: ["コーヒー店", "コーヒー豆"], development: ["AI", "Webサイト構築"] };

export function emptyLogDraft(type: LogType, category: string, slug = ""): LogDraft {
  const base: LogDraft = { slug, type, createdAt: new Date().toISOString().slice(0, 10), title: "", category, related: [] };
  if (type === "work") return { ...base, approach: "", result: "", details: (CATEGORY_FIELDS.work[category] ?? []).map(({ label }) => ({ label, value: "" })), insights: [], next: [] };
  if (type === "experience") return { ...base, details: (CATEGORY_FIELDS.experience[category] ?? []).map(({ label }) => ({ label, value: "" })), insights: [] };
  return { ...base, purpose: "", policy: "", steps: [], execution: [], result: "", next: [] };
}

export function validateLogDraft(value: unknown): value is LogDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  if (!["work", "experience", "development"].includes(String(draft.type)) || typeof draft.slug !== "string" || typeof draft.createdAt !== "string" || typeof draft.title !== "string" || typeof draft.category !== "string") return false;
  if (!LOG_CATEGORIES[draft.type as LogType].includes(draft.category)) return false;
  const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string");
  const details = (v: unknown) => Array.isArray(v) && v.every(x => x && typeof x.label === "string" && typeof x.value === "string");
  const related = (v: unknown) => Array.isArray(v) && v.every(x => x && typeof x.title === "string" && ((x.kind === "external" && typeof x.url === "string") || (x.kind === "log" && typeof x.slug === "string") || (x.kind === "backlog" && typeof x.id === "string")));
  if (!related(draft.related)) return false;
  if (draft.type === "work") return typeof draft.approach === "string" && typeof draft.result === "string" && details(draft.details) && strings(draft.insights) && strings(draft.next);
  if (draft.type === "experience") return details(draft.details) && strings(draft.insights);
  return typeof draft.purpose === "string" && typeof draft.policy === "string" && strings(draft.steps) && Array.isArray(draft.execution) && draft.execution.every(x => x && typeof x.title === "string" && typeof x.body === "string") && typeof draft.result === "string" && strings(draft.next);
}
