/**
 * The fields the Browse tab needs, and nothing else.
 *
 * A full catalog is mostly cast — 55% of the 2026 file — which browsing never
 * touches. It is also too big for the GitHub contents API, which refuses
 * anything over 1 MB, so shipping the whole thing was both wasteful and
 * broken.
 */
export const BROWSE_FIELDS = [
  'id',
  'title',
  'kind',
  'usLimitedDate',
  'usTheatricalDate',
  'homeDate',
  'festivalDate',
  'services',
  'poster',
  'ratings',
  'computedYear',
  'confidence',
  'evidence',
  'needsReview',
  'isDocumentary',
  'isForeignLanguage',
  'seen',
  'owned',
  'wantToSee',
  'onFrozenBallot',
  'overview',
  'genres',
  'tmdbVerified',
  'tmdbNote',
];

export function toBrowseRow(movie) {
  const row = {};
  for (const key of BROWSE_FIELDS) {
    if (movie[key] !== undefined) row[key] = movie[key];
  }
  return row;
}

export const toBrowseIndex = (catalog) => catalog.map(toBrowseRow);
