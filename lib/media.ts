const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

export function getMediaUrl(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }

  if (!MEDIA_BASE_URL) {
    throw new Error("NEXT_PUBLIC_MEDIA_BASE_URL is not set");
  }

  return `${MEDIA_BASE_URL.replace(/\/+$/, "")}/${src.replace(/^\/+/, "")}`;
}
