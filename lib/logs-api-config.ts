export function parseLogsApiBaseUrl(
  value: string,
  nodeEnv: string | undefined,
): URL | null {
  let baseUrl: URL;
  try {
    baseUrl = new URL(value);
  } catch {
    return null;
  }

  const isLocalDevelopmentUrl =
    nodeEnv === "development" &&
    baseUrl.protocol === "http:" &&
    baseUrl.origin === "http://localhost:3001";

  if ((baseUrl.protocol !== "https:" && !isLocalDevelopmentUrl) || baseUrl.username || baseUrl.password) {
    return null;
  }

  return baseUrl;
}
