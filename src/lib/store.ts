import { REPO_BRANCH, REPO_NAME, REPO_OWNER, mergeById, readJson, writeJson } from './github';
import type {
  Adjustment,
  CatalogMovie,
  Config,
  EligibilityOverride,
  Watch,
} from './types';

export const PATHS = {
  config: 'data/config.json',
  watches: 'data/watches.json',
  adjustments: 'data/adjustments.json',
  overrides: 'data/overrides.json',
  catalog: (year: number) => `data/catalog/${year}.json`,
  browse: (year: number) => `data/browse/${year}.json`,
  ballot: (year: number, who: string) => `data/ballots/${year}.${who}.json`,
};

export const DEFAULT_CONFIG: Config = {
  people: { me: 'Me', her: 'Her' },
  picksPerTurn: 2,
  rotationStart: 'me',
  rotationAnchor: null,
  oscarDates: {},
  frozenYears: [],
};

export interface Snapshot {
  config: Config;
  watches: Watch[];
  adjustments: Adjustment[];
  overrides: EligibilityOverride[];
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [config, watches, adjustments, overrides] = await Promise.all([
    readJson<Config>(PATHS.config, DEFAULT_CONFIG),
    readJson<Watch[]>(PATHS.watches, []),
    readJson<Adjustment[]>(PATHS.adjustments, []),
    readJson<EligibilityOverride[]>(PATHS.overrides, []),
  ]);
  return {
    config: { ...DEFAULT_CONFIG, ...config.data },
    watches: watches.data,
    adjustments: adjustments.data,
    overrides: overrides.data,
  };
}

/**
 * A year's movies for browsing.
 *
 * Read over raw.githubusercontent rather than the contents API: a full
 * catalog runs past 1 MB, which that API refuses outright, returning empty
 * content that parses to nothing. Prefer the lean browse index, which is a
 * third the size, and fall back to the full catalog for years that predate it.
 */
export async function loadCatalog(year: number): Promise<CatalogMovie[]> {
  const raw = (path: string) =>
    `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${path}?t=${Date.now()}`;

  for (const path of [PATHS.browse(year), PATHS.catalog(year)]) {
    try {
      const res = await fetch(raw(path), { cache: 'no-store' });
      if (!res.ok) continue;
      const data = (await res.json()) as CatalogMovie[];
      if (Array.isArray(data)) return data;
    } catch {
      // Try the next path; a genuine failure surfaces as an empty year.
    }
  }
  throw new Error(`Could not load the ${year} catalog.`);
}

export function newId(prefix: string) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${stamp}${rand}`;
}

export const saveWatches = (mine: Watch[], removed: string[], message: string) =>
  writeJson<Watch[]>(PATHS.watches, [], (cur) => mergeById(cur, mine, removed), message);

export const saveAdjustments = (mine: Adjustment[], removed: string[], message: string) =>
  writeJson<Adjustment[]>(PATHS.adjustments, [], (cur) => mergeById(cur, mine, removed), message);

export async function saveOverride(override: EligibilityOverride, message: string) {
  return writeJson<EligibilityOverride[]>(
    PATHS.overrides,
    [],
    (cur) => [...cur.filter((o) => o.movieId !== override.movieId), override],
    message
  );
}

export async function clearOverride(movieId: string, message: string) {
  return writeJson<EligibilityOverride[]>(
    PATHS.overrides,
    [],
    (cur) => cur.filter((o) => o.movieId !== movieId),
    message
  );
}

export const saveConfig = (next: Config, message: string) =>
  writeJson<Config>(PATHS.config, DEFAULT_CONFIG, () => next, message);
