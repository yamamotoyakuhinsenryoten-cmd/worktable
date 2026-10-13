export function serializeToolOutput(result: unknown): string {
  const output = JSON.stringify(result);
  if (output === undefined) throw new Error("Tool result is not serializable");
  return output;
}
