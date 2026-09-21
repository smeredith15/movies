import { check, suite } from './harness.mjs';

/** A stub TMDB that answers from canned payloads and records what was asked. */
function stubFetch(routes, { failTimes = 0, rateLimitTimes = 0 } = {}) {
  let failsLeft = failTimes;
  let limitsLeft = rateLimitTimes;
  const calls = [];

  const impl = async (url) => {
    calls.push(url);
    if (limitsLeft-- > 0) {
      return { status: 429, ok: false, headers: { get: () => '0' } };
    }
    if (failsLeft-- > 0) {
      return { status: 500, ok: false, headers: { get: () => null } };
    }
    const path = new URL(url).pathname;
    if (!(path in routes)) return { status: 404, ok: false, headers: { get: () => null } };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => routes[path] };
  };
  impl.calls = calls;
  return impl;
}

const DUNE_DETAILS = {
  id: 438631,
  imdb_id: 'tt1160419',
  runtime: 155,
  original_language: 'en',
  genres: [{ name: 'Science Fiction' }, { name: 'Adventure' }],
  release_dates: {
    results: [
      {
        iso_3166_1: 'IT',
        release_dates: [{ type: 3, release_date: '2021-09-15T00:00:00.000Z' }],
      },
      {
        iso_3166_1: 'US',
        release_dates: [
          { type: 1, release_date: '2021-09-03T00:00:00.000Z' }, // festival
          { type: 3, release_date: '2021-10-22T00:00:00.000Z' }, // wide
          { type: 4, release_date: '2021-10-22T00:00:00.000Z' }, // digital
          { type: 5, release_date: '2022-01-11T00:00:00.000Z' }, // physical
        ],
      },
    ],
  },
  credits: {
    cast: [
      { name: 'Timothée Chalamet', character: 'Paul Atreides' },
      { name: 'Rebecca Ferguson', character: 'Lady Jessica' },
      { name: 'Extra Person', character: '' },
    ],
  },
};

export default async function run({ Tmdb, usReleaseDates, castFrom, factsFrom, RELEASE_TYPE, credentialKind }) {
  suite('tmdb: US release dates map onto the house rules', () => {
    const d = usReleaseDates(DUNE_DETAILS);
    check('a festival premiere is kept separate', d.festivalDate, '2021-09-03');
    check('the wide run is the theatrical date', d.usTheatricalDate, '2021-10-22');
    check('home is the earlier of digital and physical', d.homeDate, '2021-10-22');
    check('no limited run means no limited date', d.usLimitedDate, null);
    check('other countries are ignored', d.usTheatricalDate !== '2021-09-15', true);

    const noUs = usReleaseDates({ release_dates: { results: [] } });
    check('a film with no US release yields nulls', noUs.usTheatricalDate, null);
    check('and does not throw', usReleaseDates(null).homeDate, null);

    const physicalOnly = usReleaseDates({
      release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ type: RELEASE_TYPE.PHYSICAL, release_date: '2023-04-04' }] }] },
    });
    check('physical alone still counts as home', physicalOnly.homeDate, '2023-04-04');
  });

  suite('tmdb: the facts the rules and the ballot need', () => {
    const f = factsFrom(DUNE_DETAILS);
    check('the tmdb id comes through', f.tmdbId, 438631);
    check('so does the imdb id', f.imdbId, 'tt1160419');
    check('English is not foreign', f.isForeignLanguage, false);
    check('and this is not a documentary', f.isDocumentary, false);
    check(
      'a non-English original language is flagged',
      factsFrom({ original_language: 'ko', genres: [] }).isForeignLanguage,
      true
    );
    check(
      'a documentary genre is flagged',
      factsFrom({ original_language: 'en', genres: [{ name: 'Documentary' }] }).isDocumentary,
      true
    );

    const cast = castFrom(DUNE_DETAILS);
    check('cast carries characters for the ballot', `${cast[0].name} as ${cast[0].character}`, 'Timothée Chalamet as Paul Atreides');
    check('billing order is preserved', cast[1].order, 1);
    check('a blank character is left undefined, not empty', cast[2].character, undefined);
    check('the list can be capped', castFrom(DUNE_DETAILS, 1).length, 1);
    check('missing credits yield nothing', castFrom({}).length, 0);
  });

  await suite('tmdb: a match has to be the same film', () => {
    const results = (arr) => ({ '/3/search/movie': { results: arr } });
    const find = (arr, title, year) =>
      new Tmdb('0123456789abcdef0123456789abcdef', { pauseMs: 0, fetchImpl: stubFetch(results(arr)) })
        .findBest(title, year);

    return Promise.all([
      find([{ title: 'Dune', release_date: '1984-12-14', popularity: 20 }, { title: 'Dune', release_date: '2021-10-22', popularity: 90 }], 'Dune', 2021)
        .then((r) => check('the right year wins', r.movie.release_date.slice(0, 4), '2021')),

      find([{ title: 'Dune', release_date: '2020-11-01', popularity: 50 }], 'Dune', 2021)
        .then((r) => check('a year either side is close enough', Boolean(r.movie), true)),

      find([{ title: 'Dune', release_date: '1984-12-14', popularity: 90 }], 'Dune', 2021)
        .then((r) => check('but not three years out', r.movie, null)),

      // The old behaviour took the most popular result for any query, which
      // handed television and mis-parsed rows confident matches to films they
      // have nothing to do with.
      find([{ title: 'Crystal Fairy', release_date: '2026-02-02', popularity: 99 }], 'Crystal Lake', 2026)
        .then((r) => check('a popular unrelated film is refused', r.movie, null)),

      find([{ title: 'The Villains', release_date: '2026-05-05', popularity: 70 }], 'House of Villains (season 3)', 2026)
        .then((r) => check('a television series finds nothing', r.movie, null)),

      find([{ title: 'Dune: Part Two', release_date: '2024-03-01', popularity: 80 }], 'Dune Part Two', 2024)
        .then((r) => check('punctuation does not break a real match', r.movie.title, 'Dune: Part Two')),

      find([], 'Nothing At All', 2020)
        .then((r) => check('no results is a refusal, not a throw', r.movie, null)),

      find([], 'Nothing At All', 2020)
        .then((r) => check('and it says why', r.reason.includes('nothing by that name'), true)),

      find([{ title: 'Some Other Film', release_date: '2019-01-01', popularity: 10 }], 'Missing Movie', 2026)
        .then((r) => check('a refusal names what it did find', r.reason.includes('Some Other Film'), true)),

      find([{ title: 'Untitled', popularity: 10 }], 'Untitled', 2026)
        .then((r) => check('a result with no release date cannot confirm a year', r.movie, null)),
    ]);
  });


  await suite('tmdb: it survives a flaky API', () => {
    const tmdb = new Tmdb('key', {
      pauseMs: 0,
      fetchImpl: stubFetch({ '/3/movie/1': DUNE_DETAILS }, { failTimes: 1 }),
    });
    return tmdb.details(1).then((d) => {
      check('a 500 is retried', d.id, 438631);
    });
  });

  await suite('tmdb: rate limits and missing films', () => {
    const limited = new Tmdb('key', {
      pauseMs: 0,
      fetchImpl: stubFetch({ '/3/movie/1': DUNE_DETAILS }, { rateLimitTimes: 1 }),
    });
    const missing = new Tmdb('key', { pauseMs: 0, fetchImpl: stubFetch({}) });
    return Promise.all([
      limited.details(1).then((d) => check('a 429 waits and retries', d.id, 438631)),
      missing.details(999).then((d) => check('a 404 is null, not an error', d, null)),
    ]);
  });

  suite('tmdb: telling the two credential types apart', () => {
    check('a v3 key is 32 hex characters', credentialKind('0123456789abcdef0123456789abcdef'), 'v3-key');
    check('a v4 token is a JWT', credentialKind('eyJhbGciOi.eyJhdWQiOi.signature'), 'v4-token');
    check('empty is missing', credentialKind(''), 'missing');
    check('so is undefined', credentialKind(undefined), 'missing');
    check('whitespace alone is missing', credentialKind('   '), 'missing');
    check('anything else is unknown', credentialKind('not-a-real-key'), 'unknown');
    check('surrounding whitespace is tolerated', credentialKind('  0123456789abcdef0123456789abcdef  '), 'v3-key');
  });

  await suite('tmdb: each credential authenticates its own way', () => {
    const seen = [];
    const spy = async (url, opts) => {
      seen.push({ url, auth: opts?.headers?.Authorization ?? null });
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true }) };
    };

    const v3 = new Tmdb('0123456789abcdef0123456789abcdef', { pauseMs: 0, fetchImpl: spy });
    const v4 = new Tmdb('eyJhbGciOi.eyJhdWQiOi.signature', { pauseMs: 0, fetchImpl: spy });

    return v3
      .get('/movie/1')
      .then(() => v4.get('/movie/1'))
      .then(() => {
        check('a v3 key goes in the query string', seen[0].url.includes('api_key=0123'), true);
        check('and sends no Authorization header', seen[0].auth, null);
        check('a v4 token goes in the header', seen[1].auth, 'Bearer eyJhbGciOi.eyJhdWQiOi.signature');
        check('and is kept out of the URL', seen[1].url.includes('api_key'), false);
      });
  });

  await suite('tmdb: a rejected credential says so plainly', () => {
    const unauthorized = new Tmdb('0123456789abcdef0123456789abcdef', {
      pauseMs: 0,
      fetchImpl: async () => ({ status: 401, ok: false, headers: { get: () => null } }),
    });
    return unauthorized
      .get('/movie/1')
      .then(() => check('a 401 throws rather than retrying', false, true))
      .catch((e) => {
        check('a 401 throws rather than retrying', e.message.includes('401'), true);
        check('and names which credential type it read', e.message.includes('v3-key'), true);
      });
  });

  suite('tmdb: the key is required', () => {
    let threw = false;
    try {
      new Tmdb('');
    } catch {
      threw = true;
    }
    check('constructing without a key fails loudly', threw, true);
  });
}
