import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from './github';

/** [id, title, year, seen] — kept as tuples to keep the payload small. */
export type IndexRow = [string, string, number, 0 | 1];

export interface Suggestion {
  id: string;
  title: string;
  year: number;
  seen: boolean;
}

let cache: IndexRow[] | null = null;
let inflight: Promise<IndexRow[]> | null = null;

/**
 * The title index is ~290 KB and static between catalog refreshes, so it is
 * fetched straight from raw.githubusercontent rather than through the API,
 * which keeps it off the authenticated rate limit.
 */
export async function loadIndex(): Promise<IndexRow[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/data/index.json`;
    try {
      const res = await fetch(url);
      cache = res.ok ? ((await res.json()) as IndexRow[]) : [];
    } catch {
      cache = [];
    }
    inflight = null;
    return cache;
  })();

  return inflight;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Rank titles for the autocomplete: a match at the start of the title beats one
 * at the start of a word, which beats one anywhere. Recent years and movies we
 * have already seen break ties, since those are what you are usually logging.
 */
export function searchIndex(rows: IndexRow[], query: string, limit = 8): Suggestion[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const scored: { row: IndexRow; score: number }[] = [];

  for (const row of rows) {
    const title = normalize(row[1]);
    let score: number;

    if (title === q) score = 0;
    else if (title.startsWith(q)) score = 1;
    else if (title.includes(` ${q}`)) score = 2;
    else if (title.includes(q)) score = 3;
    else continue;

    // Later years first, and prefer titles already marked seen.
    score = score * 1000 + (2100 - row[2]) - (row[3] ? 50 : 0);
    scored.push({ row, score });
  }

  scored.sort((a, b) => a.score - b.score);

  return scored.slice(0, limit).map(({ row }) => ({
    id: row[0],
    title: row[1],
    year: row[2],
    seen: row[3] === 1,
  }));
}
