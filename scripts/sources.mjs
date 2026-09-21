/** Where the catalog comes from. Edit the streaming list here as pages move. */

export const firstShowingUrl = (year) => `https://www.firstshowing.net/schedule${year}/`;

/**
 * Wikipedia streaming lists, read through the MediaWiki parse API rather than
 * the rendered page so the markup stays stable.
 *
 * `page` is the article title. `sinceYear` marks lists that are split by era —
 * the Netflix one rolls over to a new article every few years, so the year is
 * substituted in when we go looking.
 */
export const WIKIPEDIA_LISTS = [
  { service: 'Netflix', page: 'List_of_Netflix_original_films_(since_{YEAR})', templated: true },
  { service: 'HBO', page: 'List_of_HBO_Films_films' },
  { service: 'Hulu', page: 'List_of_Hulu_original_films' },
  { service: 'HBO Max', page: 'List_of_HBO_Max_original_films' },
  { service: 'Apple TV+', page: 'List_of_Apple_TV_original_films' },
  // This page covers Peacock's whole slate — series, specials and films — so
  // only the film sections are read.
  { service: 'Peacock', page: 'List_of_Peacock_original_programming', section: /film/i },
  { service: 'Disney+', page: 'List_of_Disney+_original_films' },
  { service: 'Prime Video', page: 'List_of_Amazon_Prime_Video_original_films' },
  { service: 'Paramount+', page: 'List_of_Paramount+_original_films' },
];

/**
 * The Netflix list splits by era. Try the era article covering `year` first and
 * fall back through recent ones, since the split year is not on a fixed cadence.
 */
export function netflixCandidates(year) {
  const starts = [year, year - 1, year - 2, year - 3, year - 4];
  return [...new Set(starts)].map((y) => `List_of_Netflix_original_films_(since_${y})`);
}

/** Titles that are revivals rather than new releases. */
export const RERELEASE_PATTERNS = [
  /\bre-?release\b/i,
  /\banniversary\b/i,
  /\bremaster(ed)?\b/i,
  /\brestoration\b/i,
  /\b4k\b/i,
  /\bfathom\b/i,
  /\bencore\b/i,
  /\bspecial (event|engagement|screening)\b/i,
  /\bin concert\b/i,
  /\breturns to (theaters|cinemas)\b/i,
  /\b\d{1,3}th anniversary\b/i,
  /\((19|20)\d{2}\)\s*$/,
];

export const isRerelease = (title, context = '') =>
  RERELEASE_PATTERNS.some((re) => re.test(title) || re.test(context));
