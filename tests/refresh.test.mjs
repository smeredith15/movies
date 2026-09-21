import { check, suite } from './harness.mjs';

export default function run({ carryOver, needsVerification, detailIsStale, pinnedIds }) {
  suite('refresh: a rebuild keeps what we decided', () => {
    const prior = {
      id: 'dune-2021',
      seen: true,
      owned: true,
      wantToSee: 9,
      onFrozenBallot: true,
      oscarNominated: true,
      ratings: { imdb: 8.5, rtCritic: 92 },
      cast: [{ name: 'Someone' }],
      imdbId: 'tt1160419',
      tmdbId: 438631,
    };
    const kept = carryOver(prior);

    check('a tick survives', kept.seen, true);
    check('so does a rating', kept.wantToSee, 9);
    check('and whether we own it', kept.owned, true);
    check('a frozen ballot place is not lost', kept.onFrozenBallot, true);
    check('nor an Oscar nomination', kept.oscarNominated, true);
    check('scores carry across', kept.ratings.imdb, 8.5);
    check('so does cast', kept.cast.length, 1);
    check('and the ids that cost API calls', `${kept.imdbId}/${kept.tmdbId}`, 'tt1160419/438631');
  });

  suite('refresh: a movie the catalog has never seen', () => {
    const fresh = carryOver(undefined);
    check('starts unseen', fresh.seen, false);
    check('and unrated, as null rather than absent', fresh.wantToSee, null);
    check('with no scores', Object.keys(fresh.ratings).length, 0);
    check('and no ballot place', fresh.onFrozenBallot, false);
    check('a missing prior behaves like an empty one', JSON.stringify(carryOver(null)), JSON.stringify(fresh));
  });

  suite('refresh: a rating of zero is still a rating', () => {
    // `||` would swallow these; the guarantee is that only absence defaults.
    check('seen false stays false', carryOver({ seen: false }).seen, false);
    check('wantToSee 0 is not turned into null', carryOver({ wantToSee: 0 }).wantToSee, 0);
  });

  suite('refresh: what still needs checking against TMDB', () => {
    const verified = { title: 'Dune', tmdbId: 438631, tmdbVerified: true };

    check('a confirmed entry is left alone', needsVerification(verified), false);

    // The bug this exists to prevent: the loose matcher gave television and
    // mis-parsed rows ids that were never confirmed. Skipping on the id alone
    // meant those were never looked at again.
    check('an id without a verification is not enough', needsVerification({ title: 'Crystal Lake', tmdbId: 111 }), true);
    check('nor is one explicitly unverified', needsVerification({ title: 'x', tmdbId: 111, tmdbVerified: false }), true);
    check('an entry with no id is checked', needsVerification({ title: 'x' }), true);
    check('a verified entry that lost its id is checked again', needsVerification({ title: 'x', tmdbVerified: true }), true);
    check('force re-checks even a confirmed one', needsVerification(verified, true), true);
    check('a missing movie does not throw', needsVerification(undefined), true);
  });

  suite('refresh: when a TMDB detail goes stale', () => {
    const now = Date.parse('2026-09-21T00:00:00Z');
    const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
    const stale = (movie, opts) => detailIsStale(movie, { now, ...opts });

    check('never fetched is stale', stale({}), true);
    check('fetched today is not', stale({ detailsUpdated: daysAgo(0) }), false);
    check('ten days old is not', stale({ detailsUpdated: daysAgo(10) }), false);
    check('forty days old is', stale({ detailsUpdated: daysAgo(40) }), true);
    check('the window is adjustable', stale({ detailsUpdated: daysAgo(10) }, { staleDays: 7 }), true);
    check('force ignores the window', stale({ detailsUpdated: daysAgo(0) }, { force: true }), true);
    check('an unreadable timestamp is treated as stale', stale({ detailsUpdated: 'nonsense' }), true);
    check('a missing movie does not throw', stale(undefined), true);

    // The bug this replaced: asking which fields are present meant a newly
    // collected field could never backfill, because every entry already had
    // cast and so the fetch was skipped.
    check('having cast is no longer evidence of freshness', stale({ cast: [{ name: 'Someone' }] }), true);
  });

  suite('refresh: ids set by hand', () => {
    const pins = pinnedIds([
      { movieId: 'hoppers-2026', tmdbId: 123456 },
      { movieId: 'year-only-2026', eligibilityYear: 2025 },
      { movieId: 'cleared-2026', tmdbId: null },
      { movieId: 'bad-2026', tmdbId: 'not a number' },
    ]);

    check('a pinned id is picked up', pins.get('hoppers-2026'), 123456);
    check('an override with only a year contributes none', pins.has('year-only-2026'), false);
    check('a cleared id is not a pin', pins.has('cleared-2026'), false);
    check('nor is a non-numeric one', pins.has('bad-2026'), false);
    check('so only the real pin is counted', pins.size, 1);
    check('no overrides at all is empty, not a throw', pinnedIds(undefined).size, 0);
  });
}
