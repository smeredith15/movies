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
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/data/tmdb-index.json`;
    try {
      const res = await fetch(url);
      cache = res.ok ? ((await res.json()) as TmdbRow[]) : [];
    } catch {
      cache = [];
    }
    inflight = null;
    return cache;
  })();

  return inflight;
}

export function searchTmdb(rows: TmdbRow[], query: string, limit = 10): TmdbHit[] {
  return rankTitles(rows, query, (r) => ({ title: r[1], year: r[2] }))
    .slice(0, limit)
    .map(({ item }) => ({ tmdbId: item[0], title: item[1], year: item[2] }));
}
