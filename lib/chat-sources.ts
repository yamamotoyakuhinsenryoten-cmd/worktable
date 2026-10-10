export type ChatSource = {
  slug: string;
  title: string;
};

/** Return validated source references, or null when the value is malformed. */
export function parseChatSources(value: unknown): ChatSource[] | null {
  if (!Array.isArray(value)) return null;

  const sources: ChatSource[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).slug !== "string" ||
      typeof (item as Record<string, unknown>).title !== "string"
    ) {
      return null;
    }

    const { slug, title } = item as ChatSource;
    if (!slug.trim() || !title.trim() || slug.length > 500 || title.length > 2_000) {
      return null;
    }

    if (!sources.some((source) => source.slug === slug)) {
      sources.push({ slug, title });
    }
  }

  return sources;
}
