/**
 * Films the scrapers never listed, added by TMDB id alone.
 *
 * Pinning an id onto a Browse row only works when there is a row. When the
 * schedule pages and the streaming lists all missed a film there is nothing to
 * pin to, and the only way in was to wait for a source to catch up.
 *
 * So an addition names a TMDB id and a year and nothing else — not even a
 * title, which we have no way of knowing before the fetch. The refresh
 * materialises it into the catalog and the ordinary pin path fills it in.
 */

/**
 * The catalog id for an addition.
 *
 * Deliberately not a title slug. Every other id is one, but a slug needs a
 * title and the whole point here is that we do not have one yet — and an id
 * that changed once the title arrived would orphan the override, the seen
 * tick, the watch and the ballot vote that point at it. The TMDB id is already
 * unique and already stable, so it is the id.
 */
export function additionId(tmdbId, year) {
  return `tmdb-${tmdbId}-${year}`;
}

/**
 * The TMDB id in whatever was pasted: the number itself, or the URL it was
 * copied from — themoviedb.org/movie/1248832-digger and its variants. Anything
 * else is null, including a TV url, which is how the old matcher went wrong.
 */
export function parseTmdbId(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) return Number(text);

  const url = text.match(/themoviedb\.org\/movie\/(\d+)/i);
  if (url) return Number(url[1]);

  return null;
}

/**
 * The placeholder an addition starts as.
 *
 * It carries no dates and no title, because none are known: the refresh pins
 * the id, fetches the detail and renames it, which is the same path a pasted
 * id on an existing row takes. `manual` keeps a full rebuild from dropping it
 * when the sources still do not list it.
 */
export function stubFor({ tmdbId, year }) {
  return {
    id: additionId(tmdbId, year),
    title: `TMDB ${tmdbId}`,
    kind: 'theatrical',
    festivalDate: null,
    usLimitedDate: null,
    usTheatricalDate: null,
    homeDate: null,
    isForeignLanguage: false,
    isDocumentary: false,
    hadUSTheatricalRelease: false,
    services: [],
    poster: null,
    sources: ['added by hand'],
    tmdbId,
    computedYear: year,
    confidence: 'medium',
    evidence: [`Added by TMDB id ${tmdbId}.`],
    needsReview: false,
    manual: true,
  };
}

/**
 * The entries an addition list is still owed by a catalog.
 *
 * Matched on the TMDB id as well as the catalog id, so adding a film a source
 * did list — under a title we did not recognise — does not produce a second
 * copy of it.
 */
export function pendingAdditions(catalog, additions, year) {
  const haveIds = new Set((catalog ?? []).map((m) => m.id));
  const haveTmdb = new Set((catalog ?? []).map((m) => m.tmdbId).filter((x) => typeof x === 'number'));

  const out = [];
  const seen = new Set();
  for (const a of additions ?? []) {
    if (Number(a?.year) !== Number(year)) continue;
    const tmdbId = Number(a?.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    if (haveTmdb.has(tmdbId) || haveIds.has(additionId(tmdbId, year))) continue;
    if (seen.has(tmdbId)) continue;
    seen.add(tmdbId);
    out.push(stubFor({ tmdbId, year }));
  }
  return out;
}
