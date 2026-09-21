import { check, suite } from './harness.mjs';

export default function run({ releaseDate }) {
  suite('browse: when could we first have watched it', () => {
    check('a wide release', releaseDate({ usTheatricalDate: '2026-06-12' }), '2026-06-12');
    check('a limited run beats the wide one that follows', releaseDate({ usLimitedDate: '2026-05-01', usTheatricalDate: '2026-06-12' }), '2026-05-01');
    check('a home release counts', releaseDate({ homeDate: '2026-04-03' }), '2026-04-03');
    check('and wins when it came first', releaseDate({ homeDate: '2026-01-05', usTheatricalDate: '2026-06-12' }), '2026-01-05');
    check('a festival premiere does not count as available', releaseDate({ festivalDate: '2025-09-05' }), null);
    check('nothing known means nothing to show', releaseDate({}), null);
    check('nulls are ignored, not sorted', releaseDate({ usLimitedDate: null, usTheatricalDate: '2026-02-02', homeDate: null }), '2026-02-02');
  });
}
