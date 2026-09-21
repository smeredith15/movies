import { check, suite } from './harness.mjs';

export default function run({ applyMark }) {
  suite('marks: what we said beats what a source said', () => {
    const movie = { id: 'dune-2021', title: 'Dune', seen: false, wantToSee: 3 };

    const none = applyMark(movie, {});
    check('with no mark the source stands', `${none.seen}/${none.wantToSee}`, 'false/3');
    check('and it is not flagged as ours', none.marked, false);

    const seen = applyMark(movie, { 'dune-2021': { seen: true, at: 'x', by: 'me' } });
    check('a tick overrides the source', seen.seen, true);
    check('without disturbing the rating', seen.wantToSee, 3);
    check('and is flagged as ours', seen.marked, true);

    const rated = applyMark(movie, { 'dune-2021': { wantToSee: 9, at: 'x', by: 'me' } });
    check('a rating overrides the source', rated.wantToSee, 9);
    check('leaving seen alone', rated.seen, false);

    const cleared = applyMark(movie, { 'dune-2021': { wantToSee: null, at: 'x', by: 'me' } });
    check('a cleared rating really clears it', cleared.wantToSee, null);

    const other = applyMark(movie, { 'something-else-2020': { seen: true, at: 'x', by: 'me' } });
    check('another movie’s mark is ignored', other.seen, false);
  });

  suite('marks: movies the workbook never rated', () => {
    const fresh = { id: 'new-2026', title: 'New' };
    check('an unrated movie reads as null, not undefined', applyMark(fresh, {}).wantToSee, null);
    check('and unseen', applyMark(fresh, {}).seen, false);
    check('a rating can be set on it', applyMark(fresh, { 'new-2026': { wantToSee: 7, at: 'x', by: 'me' } }).wantToSee, 7);
  });
}
