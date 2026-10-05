/**
 * The title index behind the Tracker's autocomplete.
 *
 * Derived from the catalogs, so it is cheap: no API calls, just a reshape of
 * files the refresh has already written. It is rebuilt by every refresh for
 * the reason it has to be — it was written once by the workbook import and
 * nothing rebuilt it afterwards, so a year could gain four hundred films while
 * the box that searches them went on offering the same six thousand, and a
 * film resolved by hand minutes earlier could not be found under either name.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** [id, title, year, seen] — tuples, because this ships to the browser whole. */
export function toIndexRow(movie, year) {
  return [movie.id, movie.title, year, movie.seen ? 1 : 0];
}

/**
 * Every catalog as one list, newest year first then alphabetical — the order
 * the import wrote and the search's tie-breaking still assumes.
 */
export function buildSearchIndex(byYear) {
  const byId = new Map();
  for (const [year, catalog] of byYear) {
    for (const movie of catalog ?? []) {
      if (!movie?.id || !movie?.title) continue;
      byId.set(movie.id, toIndexRow(movie, Number(year)));
    }
  }
  return [...byId.values()].sort((a, b) => (a[2] === b[2] ? a[1].localeCompare(b[1]) : b[2] - a[2]));
}

/** Read every data/catalog/<year>.json, newest first. */
export async function readCatalogs(root) {
  const dir = resolve(root, 'data', 'catalog');
  const years = (await readdir(dir))
    .map((name) => name.match(/^(\d{4})\.json$/)?.[1])
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a));

  const out = [];
  for (const year of years) {
    out.push([year, JSON.parse(await readFile(resolve(dir, `${year}.json`), 'utf8'))]);
  }
  return out;
}

export async function writeSearchIndex(root) {
  const rows = buildSearchIndex(await readCatalogs(root));
  await writeFile(resolve(root, 'data', 'index.json'), `${JSON.stringify(rows)}\n`);
  return rows.length;
}
