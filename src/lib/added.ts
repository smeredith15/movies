import { readJson, writeJson } from './github';

/** A movie we watched that the source workbook never listed. */
export interface AddedMovie {
  id: string;
  title: string;
  year: number;
  addedAt: string;
}

export const ADDED_PATH = 'data/added.json';

export function slugifyTitle(title: string, year: number) {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base}-${year}`;
}

export const loadAdded = () => readJson<AddedMovie[]>(ADDED_PATH, []).then((f) => f.data);

/**
 * Manually added movies live in their own small file rather than being written
 * into a 300 KB year catalog. The app merges them into the watched list and
 * the title index; the importer folds them into the catalogs on its next run,
 * where they are kept as `manual` entries and survive later re-imports.
 */
export function saveAdded(movie: AddedMovie) {
  return writeJson<AddedMovie[]>(
    ADDED_PATH,
    [],
    (current) => (current.some((m) => m.id === movie.id) ? current : [...current, movie]),
    `Add movie: ${movie.title} (${movie.year})`
  );
}

export function removeAdded(id: string, title: string) {
  return writeJson<AddedMovie[]>(
    ADDED_PATH,
    [],
    (current) => current.filter((m) => m.id !== id),
    `Remove added movie: ${title}`
  );
}
