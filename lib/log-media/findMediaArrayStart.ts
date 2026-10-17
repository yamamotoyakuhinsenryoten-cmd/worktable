export function findMediaArrayStart(code: string): number {
  return code.search(/(?:media|"media"): \[/);
}
