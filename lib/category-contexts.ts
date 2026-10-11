import { CATEGORIES, type CategoryId } from "@/lib/categories";

export async function getCommonContext(): Promise<string | null> {
  const { sql } = await import("@/lib/db");
  const rows = await sql`
    SELECT body
    FROM category_contexts
    WHERE category_id = 'common'
    LIMIT 1
  `;
  return rows.length > 0 && typeof rows[0].body === "string" ? rows[0].body : null;
}

export async function getCategoryContext(categoryId: CategoryId) {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return null;

  const { sql } = await import("@/lib/db");
  const rows = await sql`
    SELECT body
    FROM category_contexts
    WHERE category_id = ${category.id}
    LIMIT 1
  `;
  if (!rows.length || typeof rows[0].body !== "string") return null;

  return { category, body: rows[0].body };
}
