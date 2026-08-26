/**
 * Escapes SQL LIKE / MSSQL pattern metacharacters so a user search string can
 * be passed to a parameterized `contains` / `LIKE` without acting as a wildcard.
 * Unused by the current client-side search; kept for a future server search endpoint.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[[\]%_]/g, (ch) => `[${ch}]`)
}
