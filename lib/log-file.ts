import { access } from "node:fs/promises";

export async function isLogFilePresent(
  filePath: string,
  checkAccess: (path: string) => Promise<void> = access,
): Promise<boolean> {
  try {
    await checkAccess(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
