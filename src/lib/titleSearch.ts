/** Title matching shared by the catalog autocomplete and the TMDB search. */

export const normalizeTitle = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * How well a title matches, lower being better; null means no match at all.
 * A hit at the start of the title beats one at the start of a word, which
 * beats one anywhere.
 */
export function matchRank(title: string, normalizedQuery: string): number | null {
  const t = normalizeTitle(title);
  if (t === normalizedQuery) return 0;
  if (t.startsWith(normalizedQuery)) return 1;
  if (t.includes(` ${normalizedQuery}`)) return 2;
  if (t.includes(normalizedQuery)) return 3;
  return null;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Rank a list by how well each title matches. `recency` breaks ties towards
 * newer films, and `boost` lets a caller prefer some rows over others.
 */
export function rankTitles<T>(
  items: Iterable<T>,
  query: string,
  get: (item: T) => { title: string; year: number },
  boost: (item: T) => number = () => 0
): Ranked<T>[] {
  const q = normalizeTitle(query);
  if (q.length < 2) return [];

  const out: Ranked<T>[] = [];
  for (const item of items) {
    const { title, year } = get(item);
    const rank = matchRank(title, q);
    if (rank === null) continue;

    // How much of the title the query accounts for. Searching "godfather"
    // should surface The Godfather before The Godfather Part II, which
    // recency alone gets backwards.
    const coverage = q.length / Math.max(normalizeTitle(title).length, 1);
    const spread = Math.round((1 - Math.min(coverage, 1)) * 100);

    out.push({ item, score: rank * 1000 + spread + (2100 - year) / 10 + boost(item) });
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}
