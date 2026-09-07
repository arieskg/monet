/** Quote one POSIX shell argument, including paths with spaces or apostrophes. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
