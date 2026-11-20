import { check, suite } from './harness.mjs';

export default function run({ additionId, parseTmdbId, stubFor, pendingAdditions }) {
  suite('additions: reading what was pasted', () => {
    check('a bare id', parseTmdbId('1248832'), 1248832);
    check('with whitespace around it', parseTmdbId('  1248832 '), 1248832);
    // People copy the URL far more often than the number.
    check('a TMDB link', parseTmdbId('https://www.themoviedb.org/movie/1248832-digger'), 1248832);
    check('without the slug', parseTmdbId('https://www.themoviedb.org/movie/1248832'), 1248832);
    check('without the scheme', parseTmdbId('themoviedb.org/movie/1248832'), 1248832);

    // A TV url is exactly how the old permissive matcher went wrong, so it is
    // refused rather than read as a film id that happens to parse.
    check('a TV link is refused', parseTmdbId('https://www.themoviedb.org/tv/1396'), null);
    check('a title is not an id', parseTmdbId('Digger'), null);
    check('nothing is not an id', parseTmdbId(''), null);
    check('and neither is undefined', parseTmdbId(undefined), null);
  });

  suite('additions: the id is the TMDB id, not the title', () => {
    // Every other catalog id is a title slug, but a slug needs a title and the
    // point here is that we have none yet. An id that changed once the title
    // arrived would orphan the override, the tick, the watch and the vote.
    check('stable before the title is known', additionId(1248832, 2026), 'tmdb-1248832-2026');
    const stub = stubFor({ tmdbId: 1248832, year: 2026 });
    check('the stub carries it', stub.id, 'tmdb-1248832-2026');
    check('and the id to fetch', stub.tmdbId, 1248832);
    check('and the year it was added to', stub.computedYear, 2026);
    // manual is what stops a full rebuild dropping it while no source lists it.
    check('a rebuild has to keep it', stub.manual, true);
    check('it says why it is there', stub.evidence[0], 'Added by TMDB id 1248832.');
    check('and claims no dates it does not have', stub.usTheatricalDate, null);
  });

  suite('additions: what a catalog is still owed', () => {
    const catalog = [{ id: 'digger-2026', title: 'Digger', tmdbId: 1248832 }];
    const add = (tmdbId, year) => ({ tmdbId, year, at: 'x', by: 'me' });

    check('a new film is owed', pendingAdditions(catalog, [add(999, 2026)], 2026).length, 1);

    // Matched on the TMDB id too: adding a film a source did list, under a
    // title we failed to recognise, must not make a second copy of it.
    check('one already there is not', pendingAdditions(catalog, [add(1248832, 2026)], 2026).length, 0);
    check(
      'nor one already materialised',
      pendingAdditions([{ id: 'tmdb-999-2026', tmdbId: null }], [add(999, 2026)], 2026).length,
      0
    );

    check('another year is left alone', pendingAdditions(catalog, [add(999, 2025)], 2026).length, 0);
    check('a year as a string still matches', pendingAdditions(catalog, [add(999, '2026')], 2026).length, 1);
    check('the same id twice is one entry', pendingAdditions(catalog, [add(999, 2026), add(999, 2026)], 2026).length, 1);

    check('a junk id is dropped', pendingAdditions(catalog, [add('nope', 2026)], 2026).length, 0);
    check('and so is a negative one', pendingAdditions(catalog, [add(-5, 2026)], 2026).length, 0);
    check('an empty list is not a crash', pendingAdditions(catalog, [], 2026).length, 0);
    check('nor a missing one', pendingAdditions(catalog, null, 2026).length, 0);
    check('nor an empty catalog', pendingAdditions([], [add(999, 2026)], 2026).length, 1);
  });
}
