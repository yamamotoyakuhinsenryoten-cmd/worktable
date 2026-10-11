export const LOG_TYPES = ["work", "experience", "development"] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const CATEGORIES = [
  { id: "roasting", displayName: "焙煎", logTypes: ["work"], externalNames: ["焙煎"] },
  { id: "dyeing", displayName: "染物", logTypes: ["work"], externalNames: ["染物"] },
  { id: "sewing", displayName: "縫物", logTypes: ["work"], externalNames: ["縫物"] },
  { id: "coffee-shop", displayName: "コーヒー店", logTypes: ["experience"], externalNames: ["コーヒー店"] },
  { id: "coffee-beans", displayName: "コーヒー豆", logTypes: ["experience"], externalNames: ["コーヒー豆"] },
  { id: "ai", displayName: "AI", logTypes: ["development"], externalNames: ["AI"] },
  { id: "website-development", displayName: "Webサイト構築", logTypes: ["development"], externalNames: ["Webサイト構築"] },
] as const satisfies ReadonlyArray<{
  id: string;
  displayName: string;
  logTypes: readonly LogType[];
  externalNames: readonly string[];
}>;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const EXTERNAL_LOG_CATEGORY_NAMES = [...new Set(CATEGORIES.flatMap(({ externalNames }) => externalNames))];

export function isLogType(value: unknown): value is LogType {
  return typeof value === "string" && (LOG_TYPES as readonly string[]).includes(value);
}

export function isExternalLogCategory(value: unknown): value is string {
  return typeof value === "string" && (EXTERNAL_LOG_CATEGORY_NAMES as readonly string[]).includes(value);
}

export function categoriesForLogType(logType: LogType) {
  return CATEGORIES.filter((category) => (category.logTypes as readonly LogType[]).includes(logType));
}
