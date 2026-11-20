import { readJson, writeJson } from './github';
import { additionId } from '../../shared/additions.js';

/**
 * A film the scrapers never listed, named by TMDB id and nothing else.
 *
 * It carries no title: there is no way to know one before the fetch, and that
 * is the whole reason this exists. The refresh turns it into a catalog entry
 * and the ordinary pin path fills it in.
 */
export interface CatalogAddition {
  tmdbId: number;
  year: number;
  at: string;
  by: string;
}

export const ADDITIONS_PATH = 'data/additions.json';

export const loadAdditions = () =>
  readJson<CatalogAddition[]>(ADDITIONS_PATH, []).then((f) => f.data);

/**
 * Kept rather than consumed. It is the record of why an entry no source lists
 * is in the catalog at all, and what a full rebuild puts back when the sources
 * still do not list it.
 */
export function saveAddition(addition: CatalogAddition) {
  return writeJson<CatalogAddition[]>(
    ADDITIONS_PATH,
    [],
    (current) =>
      current.some((a) => a.tmdbId === addition.tmdbId && a.year === addition.year)
        ? current
        : [...current, addition],
    `Add TMDB ${addition.tmdbId} to ${addition.year}`
  );
}

export { additionId };
