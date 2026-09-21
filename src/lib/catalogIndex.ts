import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from './github';
import { rankTitles } from './titleSearch';

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

export function searchIndex(rows: IndexRow[], query: string, limit = 8): Suggestion[] {
  // Movies we have already seen rank slightly higher, since those are what you
  // are usually logging.
  return rankTitles(
    rows,
    query,
    (r) => ({ title: r[1], year: r[2] }),
    (r) => (r[3] ? -50 : 0)
  )
    .slice(0, limit)
    .map(({ item }) => ({ id: item[0], title: item[1], year: item[2], seen: item[3] === 1 }));
}
