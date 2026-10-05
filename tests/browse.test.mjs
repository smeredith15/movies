import { check, suite } from './harness.mjs';

export default function run({ releaseDate, carriesPin }) {
  suite('browse: when could we first have watched it', () => {
    check('a wide release', releaseDate({ usTheatricalDate: '2026-06-12' }), '2026-06-12');
    check('a limited run beats the wide one that follows', releaseDate({ usLimitedDate: '2026-05-01', usTheatricalDate: '2026-06-12' }), '2026-05-01');
    check('a home release counts', releaseDate({ homeDate: '2026-04-03' }), '2026-04-03');
    check('and wins when it came first', releaseDate({ homeDate: '2026-01-05', usTheatricalDate: '2026-06-12' }), '2026-01-05');
    check('a festival premiere does not count as available', releaseDate({ festivalDate: '2025-09-05' }), null);
    check('nothing known means nothing to show', releaseDate({}), null);
    check('nulls are ignored, not sorted', releaseDate({ usLimitedDate: null, usTheatricalDate: '2026-02-02', homeDate: null }), '2026-02-02');
  });

  suite('browse: is this the file the run wrote', () => {
    // A run reports success seconds after its push, while raw.github can still
    // be serving the previous file — so "the run went green" is not the same
    // question as "the new data is readable", and only the second one matters.
    check('the pinned id came back', carriesPin({ tmdbId: 1248832 }, 1248832), true);
    check('the old file has not caught up', carriesPin({ tmdbId: null }, 1248832), false);
    check('a different id is not ours', carriesPin({ tmdbId: 99 }, 1248832), false);
    check('an entry missing entirely is not resolved', carriesPin(undefined, 1248832), false);

    // Clearing the field is not something to wait for, and treating a cleared
    // id as a match would make every unresolved row look resolved.
    check('no pin is never satisfied', carriesPin({ tmdbId: null }, null), false);
    check('not even by a row that has one', carriesPin({ tmdbId: 1248832 }, null), false);
  });
}
