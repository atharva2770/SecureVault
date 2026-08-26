/**
 * Escapes SQL LIKE / MSSQL pattern metacharacters so a user prefix can be
 * passed to a parameterized `LIKE prefix%` without acting as a wildcard.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[[\]%_]/g, (ch) => `[${ch}]`)
}
