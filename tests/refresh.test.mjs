import { check, suite } from './harness.mjs';

export default function run({ carryOver, needsVerification }) {
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
}
