import type { CategoryId } from "./categories";

export type CategoryClassification = {
  categoryIds: CategoryId[];
  status: "classified" | "unclassified" | "invalid_output" | "error";
};

export function parseCategoryClassification(output: string, allowedIds: readonly string[]): CategoryClassification {
  try {
    const parsed: unknown = JSON.parse(output);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { categoryIds: [], status: "invalid_output" };
    }
    const value = (parsed as { categoryIds?: unknown }).categoryIds;
    if (
      !Array.isArray(value) ||
      value.length > 3 ||
      value.some((id) => !allowedIds.includes(id as string)) ||
      new Set(value).size !== value.length
    ) {
      return { categoryIds: [], status: "invalid_output" };
    }
    const categoryIds = value as CategoryId[];
    return { categoryIds, status: categoryIds.length ? "classified" : "unclassified" };
  } catch {
    return { categoryIds: [], status: "invalid_output" };
  }
}
