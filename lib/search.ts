/** Escape a user string for PostgREST ilike/or filters. */
export function ilikePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ")}%`;
}
