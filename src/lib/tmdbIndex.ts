import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from './github';
import { rankTitles } from './titleSearch';

/** [tmdbId, title, releaseYear] */
export type TmdbRow = [number, string, number];

export interface TmdbHit {
  tmdbId: number;
  title: string;
  year: number;
}

let cache: TmdbRow[] | null = null;
let inflight: Promise<TmdbRow[]> | null = null;

export const isLoaded = () => cache !== null;

/**
 * The TMDB search corpus, built by the Action and committed to the repo —
 * the page cannot query TMDB itself, because the API key is a repository
 * secret and anything the page can read is public.
 *
 * It is larger than the catalog index and only useful when adding a movie, so
 * it is fetched on first use rather than at startup.
 */
export async function loadTmdbIndex(): Promise<TmdbRow[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    // raw.githubusercontent caches for several minutes, so a freshly built
    // index would otherwise keep reading as the old empty one.
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/data/tmdb-index.json?t=${Date.now()}`;
    let rows: TmdbRow[] = [];
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) rows = (await res.json()) as TmdbRow[];
    } catch {
      rows = [];
    }
    // Only an actual result is worth keeping. Caching an empty one would make
    // a transient failure permanent for the rest of the visit.
    if (rows.length > 0) cache = rows;
    inflight = null;
    return rows;
  })();

  return inflight;
}

/** The span the index covers, for telling someone why a search found nothing. */
export function indexCoverage(rows: TmdbRow[]): { count: number; from: number | null } {
  if (rows.length === 0) return { count: 0, from: null };
  let from = rows[0][2];
  for (const r of rows) if (r[2] < from) from = r[2];
  return { count: rows.length, from };
}

export function searchTmdb(rows: TmdbRow[], query: string, limit = 10): TmdbHit[] {
  return rankTitles(rows, query, (r) => ({ title: r[1], year: r[2] }))
    .slice(0, limit)
    .map(({ item }) => ({ tmdbId: item[0], title: item[1], year: item[2] }));
}
