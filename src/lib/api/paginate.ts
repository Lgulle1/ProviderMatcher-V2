/**
 * PostgREST caps how many rows a single response may return — 1000 on Supabase
 * by default. A plain `select()` therefore starts silently truncating once a
 * tenant grows past that, which is worse than being slow: counts and lists come
 * back quietly wrong. Anything that reads a whole table pages through it.
 */
export const PAGE_SIZE = 1000

/**
 * Runs `buildPage` over successive ranges until a short page proves the end was
 * reached, returning every row. Returns null if any page errors, so callers can
 * tell "no rows" apart from "the read failed".
 */
export async function selectAllRows<Row>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[] | null> {
  const all: Row[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1)
    if (error || !data) {
      return null
    }
    all.push(...data)
    if (data.length < PAGE_SIZE) {
      return all
    }
  }
}
