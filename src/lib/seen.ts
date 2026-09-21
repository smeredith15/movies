import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from './github';

/** [id, title, releaseYear] — every movie the workbook marked as watched. */
export type SeenRow = [string, string, number];

export interface SeenMovie {
  id: string;
  title: string;
  year: number;
}

let cache: SeenMovie[] | null = null;
let inflight: Promise<SeenMovie[]> | null = null;

/**
 * The watched list imported from the workbook. It carries no dates and no
 * picker — the workbook never recorded them — so the History page shows these
 * as entries waiting to be dated.
 */
export async function loadSeen(): Promise<SeenMovie[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/data/seen.json?t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const rows: SeenRow[] = res.ok ? await res.json() : [];
      cache = rows.map(([id, title, year]) => ({ id, title, year }));
    } catch {
      cache = [];
    }
    inflight = null;
    return cache;
  })();

  return inflight;
}
