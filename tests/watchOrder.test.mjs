import { check, suite } from './harness.mjs';

/** Ids as newId makes them: a base36 millisecond stamp, so they sort by age. */
const w = (id, date, seq) => ({ id, date, ...(seq === undefined ? {} : { seq }) });
const ids = (list) => list.map((x) => x.id).join(',');

export default function run({ withinDay, oldestFirst, newestFirst, moveWithinDay, sharesItsDay, dayPosition, ordinal }) {
  suite('same day: the replay goes forward, the list goes back', () => {
    // Two films on one evening. The rotation has to replay them in the order
    // they happened; the list has to show the most recent one at the top, the
    // same as it does for days. Those are opposite directions, and the comparator
    // the lists used could not express either — it never returned 0 for equals,
    // so the engine was free to order an evening however it liked.
    const evening = [w('w_c', '2026-10-31'), w('w_a', '2026-10-31'), w('w_b', '2026-10-31')];
    check('the replay runs oldest first', ids(oldestFirst(evening)), 'w_a,w_b,w_c');
    check('the list runs newest first', ids(newestFirst(evening)), 'w_c,w_b,w_a');
  });

  suite('same day: a hand-set order wins', () => {
    const evening = [w('w_a', '2026-10-31', 1), w('w_b', '2026-10-31', 0)];
    check('seq beats the id', ids(oldestFirst(evening)), 'w_b,w_a');
    check('and the list still shows the later one on top', ids(newestFirst(evening)), 'w_a,w_b');

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
    check('newest first descends', ids(newestFirst(days)), 'w_b,w_a');

    // The direction must not reverse halfway down: top is the most recent
    // thing, inside a day as much as across them. An evening went in backwards
    // when it did reverse, because its top row was read as the latest film.
    const mixed = [w('w_c', '2026-10-31'), w('w_a', '2026-10-30'), w('w_b', '2026-10-31')];
    check('one direction throughout', ids(newestFirst(mixed)), 'w_c,w_b,w_a');
  });

  suite('undated entries have no place in the order', () => {
    const some = [w('w_b', ''), w('w_a', '2026-10-31')];
    check('they trail the dated ones', ids(newestFirst(some)), 'w_a,w_b');
    check('and fall back to id among themselves', ids(newestFirst([w('w_z', ''), w('w_y', '')])), 'w_y,w_z');
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

  suite('a row states which film of its evening it was', () => {
    // The list runs newest day first while a day runs oldest film first, so the
    // direction of time reverses inside a day. A real evening went in backwards
    // because its top row was read as the latest film; a row that says "1st of
    // 2 that day" cannot be read that way.
    const list = [w('w_a', '2026-11-01'), w('w_b', '2026-11-01'), w('w_c', '2026-10-27')];
    check('the first film says so', JSON.stringify(dayPosition(list, list[0])), '{"nth":1,"of":2}');
    check('the second too', JSON.stringify(dayPosition(list, list[1])), '{"nth":2,"of":2}');
    check('a day of one says nothing', dayPosition(list, list[2]), null);
    check('nor does an undated entry', dayPosition(list, w('w_d', '')), null);

    // A hand-set order is what the badge has to report, or it would contradict
    // the very move that was just made.
    const fixed = [w('w_a', '2026-11-01', 1), w('w_b', '2026-11-01', 0)];
    check('seq decides the number', JSON.stringify(dayPosition(fixed, fixed[0])), '{"nth":2,"of":2}');

    check('1st', ordinal(1), '1st');
    check('2nd', ordinal(2), '2nd');
    check('3rd', ordinal(3), '3rd');
    check('4th', ordinal(4), '4th');
  });

  suite('which rows get the controls', () => {
    const list = [w('w_a', '2026-10-31'), w('w_b', '2026-10-31'), w('w_c', '2026-10-30'), w('w_d', '')];
    check('a shared day does', sharesItsDay(list, list[0]), true);
    check('a day of one does not', sharesItsDay(list, list[2]), false);
    check('an undated entry never does', sharesItsDay(list, list[3]), false);
  });
}
