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

export default async function run({ Tmdb, usReleaseDates, castFrom, factsFrom, RELEASE_TYPE }) {
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

  await suite('tmdb: picking the right match', () => {
    const results = (arr) => ({ '/3/search/movie': { results: arr } });

    const run1 = new Tmdb('key', {
      pauseMs: 0,
      fetchImpl: stubFetch(results([
        { title: 'Dune', release_date: '1984-12-14', popularity: 20 },
        { title: 'Dune', release_date: '2021-10-22', popularity: 90 },
      ])),
    });

    return Promise.all([
      run1.findBest('Dune', 2021).then((r) =>
        check('the right year wins over popularity', r.release_date.slice(0, 4), '2021')
      ),
      new Tmdb('key', {
        pauseMs: 0,
        fetchImpl: stubFetch(results([
          { title: 'Dune: Part Two', release_date: '2024-03-01', popularity: 99 },
          { title: 'Dune', release_date: '2021-10-22', popularity: 50 },
        ])),
      })
        .findBest('Dune', 2021)
        .then((r) => check('an exact title beats a popular near-match', r.title, 'Dune')),
      new Tmdb('key', { pauseMs: 0, fetchImpl: stubFetch(results([])) })
        .findBest('Nothing At All', 2020)
        .then((r) => check('no results is null, not a throw', r, null)),
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
