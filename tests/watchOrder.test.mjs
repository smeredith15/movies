import { check, suite } from './harness.mjs';

/** Ids as newId makes them: a base36 millisecond stamp, so they sort by age. */
const w = (id, date, seq) => ({ id, date, ...(seq === undefined ? {} : { seq }) });
const ids = (list) => list.map((x) => x.id).join(',');

export default function run({ withinDay, oldestFirst, newestDayFirst, moveWithinDay, sharesItsDay }) {
  suite('same day: oldest first, by when it was logged', () => {
    // The whole bug: two films on one evening came out newest-first, because
    // the comparator never returned 0 and the engine was free to reverse them.
    const evening = [w('w_c', '2026-10-31'), w('w_a', '2026-10-31'), w('w_b', '2026-10-31')];
    check('ascending by id', ids(oldestFirst(evening)), 'w_a,w_b,w_c');
    check('and within a newest-first list too', ids(newestDayFirst(evening)), 'w_a,w_b,w_c');
  });

  suite('same day: a hand-set order wins', () => {
    const evening = [w('w_a', '2026-10-31', 1), w('w_b', '2026-10-31', 0)];
    check('seq beats the id', ids(oldestFirst(evening)), 'w_b,w_a');

    // A day is numbered all at once, so anything without a number arrived after
    // the numbering did.
    const plusNew = [...evening, w('w_z', '2026-10-31')];
    check('an unnumbered entry trails', ids(oldestFirst(plusNew)), 'w_b,w_a,w_z');
    check('two unnumbered fall back to id', ids(oldestFirst([w('w_y', '2026-10-31'), w('w_x', '2026-10-31')])), 'w_x,w_y');
    check('comparing two unnumbered is not NaN', withinDay(w('w_b', 'd'), w('w_a', 'd')) > 0, true);
  });

  suite('across days', () => {
    const days = [w('w_a', '2026-10-30'), w('w_b', '2026-10-31')];
    check('oldest first climbs', ids(oldestFirst(days)), 'w_a,w_b');
    check('newest day first descends', ids(newestDayFirst(days)), 'w_b,w_a');

    // Newest evening first, oldest film within it — how a list of evenings reads.
    const mixed = [w('w_c', '2026-10-31'), w('w_a', '2026-10-30'), w('w_b', '2026-10-31')];
    check('both at once', ids(newestDayFirst(mixed)), 'w_b,w_c,w_a');
  });

  suite('undated entries have no place in the order', () => {
    const some = [w('w_b', ''), w('w_a', '2026-10-31')];
    check('they trail the dated ones', ids(newestDayFirst(some)), 'w_a,w_b');
    check('and fall back to id among themselves', ids(newestDayFirst([w('w_z', ''), w('w_y', '')])), 'w_y,w_z');
  });

  suite('moving one entry within its day', () => {
    const list = [w('w_a', '2026-10-31'), w('w_b', '2026-10-31'), w('w_c', '2026-10-30')];

    const down = moveWithinDay(list, 'w_a', 1);
    check('the whole day is returned', down.length, 2);
    check('renumbered in the new order', down.map((x) => `${x.id}:${x.seq}`).join(','), 'w_b:0,w_a:1');
    check('the other day is untouched', down.some((x) => x.id === 'w_c'), false);

    const up = moveWithinDay(list, 'w_b', -1);
    check('moving up works the same', up.map((x) => `${x.id}:${x.seq}`).join(','), 'w_b:0,w_a:1');

    // A disabled button that gets pressed anyway must not write anything.
    check('off the top is nothing', moveWithinDay(list, 'w_a', -1).length, 0);
    check('off the bottom is nothing', moveWithinDay(list, 'w_b', 1).length, 0);
    check('an only child cannot move', moveWithinDay(list, 'w_c', -1).length, 0);
    check('an undated entry cannot move', moveWithinDay([w('w_x', '')], 'w_x', 1).length, 0);
    check('nor can one that is not there', moveWithinDay(list, 'w_nope', 1).length, 0);
  });

  suite('moving twice returns where it started', () => {
    const list = [w('w_a', '2026-10-31'), w('w_b', '2026-10-31')];
    const once = moveWithinDay(list, 'w_a', 1);
    const back = moveWithinDay(once, 'w_a', -1);
    check('order restored', ids(oldestFirst(back)), 'w_a,w_b');
    check('and still fully numbered', back.every((x) => typeof x.seq === 'number'), true);
  });

  suite('which rows get the controls', () => {
    const list = [w('w_a', '2026-10-31'), w('w_b', '2026-10-31'), w('w_c', '2026-10-30'), w('w_d', '')];
    check('a shared day does', sharesItsDay(list, list[0]), true);
    check('a day of one does not', sharesItsDay(list, list[2]), false);
    check('an undated entry never does', sharesItsDay(list, list[3]), false);
  });
}
