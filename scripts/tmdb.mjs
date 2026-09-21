/**
 * TMDB lookups, used only from GitHub Actions so the API key stays a secret.
 *
 * The valuable part is `release_dates`: TMDB records US releases by type,
 * which maps straight onto the house eligibility rules — a festival premiere,
 * a limited run, a wide run and a home release are four different things, and
 * telling them apart is the whole problem.
 */

const BASE = 'https://api.themoviedb.org/3';

/** TMDB release types. */
export const RELEASE_TYPE = {
  PREMIERE: 1, // festival or premiere — never sets the year
  LIMITED: 2,
  THEATRICAL: 3,
  DIGITAL: 4,
  PHYSICAL: 5,
  TV: 6,
};

/**
 * TMDB issues two kinds of credential and they authenticate differently: a v3
 * API key goes in the query string, a v4 read access token is a JWT and goes
 * in an Authorization header. Mixing them up returns 401, so detect which one
 * we were given rather than making the caller care.
 */
export function credentialKind(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'missing';
  if (v.startsWith('ey') && v.split('.').length === 3) return 'v4-token';
  if (/^[0-9a-f]{32}$/i.test(v)) return 'v3-key';
  return 'unknown';
}

export class Tmdb {
  constructor(apiKey, { fetchImpl = fetch, pauseMs = 60 } = {}) {
    if (!apiKey) throw new Error('TMDB api key is required');
    this.apiKey = String(apiKey).trim();
    this.kind = credentialKind(this.apiKey);
    this.fetch = fetchImpl;
    this.pauseMs = pauseMs;
    this.calls = 0;
  }

  async get(path, params = {}) {
    const url = new URL(`${BASE}${path}`);
    // An unrecognised credential is tried as a v3 key, which is the common case.
    if (this.kind !== 'v4-token') url.searchParams.set('api_key', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers = { Accept: 'application/json' };
    if (this.kind === 'v4-token') headers.Authorization = `Bearer ${this.apiKey}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.fetch(url.toString(), { headers });
      this.calls += 1;

      if (res.status === 401) {
        throw new Error(
          `TMDB rejected the credential (401). It was read as ${this.kind}. ` +
            'A v3 API key is 32 hex characters; a v4 token starts with "ey" and has two dots.'
        );
      }

      if (res.status === 429) {
        const wait = Number(res.headers?.get?.('retry-after') ?? 2) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        if (attempt === 2) throw new Error(`TMDB ${path} failed: ${res.status}`);
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }

      if (this.pauseMs) await new Promise((r) => setTimeout(r, this.pauseMs));
      return res.json();
    }
    return null;
  }

  search(query, year) {
    return this.get('/search/movie', {
      query,
      primary_release_year: year,
      include_adult: false,
    });
  }

  details(id) {
    return this.get(`/movie/${id}`, { append_to_response: 'release_dates,credits' });
  }

  /** Best match for a title we already believe in, preferring the right year. */
  async findBest(title, year) {
    const exact = await this.search(title, year);
    let results = exact?.results ?? [];
    if (results.length === 0) {
      const loose = await this.search(title);
      results = loose?.results ?? [];
    }
    if (results.length === 0) return null;

    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = norm(title);

    const scored = results.map((r) => {
      const released = r.release_date ? Number(r.release_date.slice(0, 4)) : null;
      let score = 0;
      if (norm(r.title) === target) score -= 100;
      else if (norm(r.title).startsWith(target)) score -= 50;
      if (year && released === year) score -= 40;
      else if (year && released) score += Math.min(Math.abs(released - year), 10);
      score -= Math.min(r.popularity ?? 0, 50) / 10;
      return { r, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored[0].r;
  }
}

/**
 * Pull the US dates out of a details payload and label them the way the
 * eligibility rules expect. Returns nulls rather than guessing.
 */
export function usReleaseDates(details) {
  const out = {
    festivalDate: null,
    usLimitedDate: null,
    usTheatricalDate: null,
    homeDate: null,
  };

  const us = (details?.release_dates?.results ?? []).find((r) => r.iso_3166_1 === 'US');
  if (!us) return out;

  const earliest = (type) =>
    us.release_dates
      .filter((d) => d.type === type && d.release_date)
      .map((d) => d.release_date.slice(0, 10))
      .sort()[0] ?? null;

  out.festivalDate = earliest(RELEASE_TYPE.PREMIERE);
  out.usLimitedDate = earliest(RELEASE_TYPE.LIMITED);
  out.usTheatricalDate = earliest(RELEASE_TYPE.THEATRICAL);

  // "Available to us at home" is whichever of digital or physical came first.
  const digital = earliest(RELEASE_TYPE.DIGITAL);
  const physical = earliest(RELEASE_TYPE.PHYSICAL);
  out.homeDate = [digital, physical].filter(Boolean).sort()[0] ?? null;

  return out;
}

/** Top-billed cast and the characters they play, for the ballot's categories. */
export function castFrom(details, limit = 20) {
  return (details?.credits?.cast ?? [])
    .slice(0, limit)
    .map((c, order) => ({ name: c.name, character: c.character || undefined, order }));
}

export function factsFrom(details) {
  const genres = (details?.genres ?? []).map((g) => g.name);
  return {
    tmdbId: details?.id ?? null,
    imdbId: details?.imdb_id ?? null,
    isDocumentary: genres.includes('Documentary'),
    isForeignLanguage: Boolean(details?.original_language) && details.original_language !== 'en',
    runtime: details?.runtime ?? null,
    genres,
  };
}
