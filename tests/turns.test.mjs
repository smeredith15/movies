import { check, suite } from './harness.mjs';

export default function run(turns) {
  const { computeTurnState, describeTurn } = turns;
  const config = {
    people: { me: 'Me', her: 'Her' },
    picksPerTurn: 2,
    rotationStart: 'me',
    oscarDates: {},
    frozenYears: [],
  };

  let n = 0;
  const w = (date, title, picker, extra = {}) => ({
    id: `w${String(++n).padStart(3, '0')}`,
    date, title, movieId: null, venue: 'home', picker, consumesTurn: true, ...extra,
  });
  const theater = (date, title) => w(date, title, 'joint', { venue: 'theater', consumesTurn: false });
  const adj = (date, type, who, count, note) => ({ id: `a${String(++n).padStart(3, '0')}`, date, type, who, count, note });
  const state = (ws, as = []) => computeTurnState(ws, as, config);

  suite('turns: the plain two-and-two rotation', () => {
    check('an empty history opens with the configured starter', state([]).upNext, 'me');
    check('it reads naturally', describeTurn(state([]), config), 'Me is up — 2 picks in a row');
    check('after my two it is hers', state([w('2026-01-02', 'A', 'me'), w('2026-01-09', 'B', 'me')]).upNext, 'her');
    check(
      'a full cycle wraps back to me',
      state([w('2026-01-02','A','me'), w('2026-01-09','B','me'), w('2026-01-16','C','her'), w('2026-01-23','D','her')]).upNext,
      'me'
    );
  });

  suite('turns: theater trips are decided together', () => {
    const s = state([w('2026-01-02','A','me'), theater('2026-01-05','Theater Night'), w('2026-01-09','B','me')]);
    check('a joint trip does not advance the rotation', s.upNext, 'her');
    check('and does not count against anyone', `${s.used.me}/${s.used.her}`, '2/0');
  });

  suite('turns: trading a pick to catch something in time', () => {
    const s = state([w('2026-01-02','A','me'), w('2026-01-09','B','me'), w('2026-01-16','C','me','')]);
    check('she is still owed the slot I took', s.upNext, 'her');
    check('the trade is recorded in the trail', s.events.at(-1).traded, true);
    check('and it is repaid out of my next block', s.queue.slice(0, 3).join(','), 'her,her,me');
    // The point of a trade is that it costs nothing over the full block:
    // count what each of us has already used plus what is still queued.
    const ahead = s.queue.slice(0, 5);
    const mine = s.used.me + ahead.filter((p) => p === 'me').length;
    const hers = s.used.her + ahead.filter((p) => p === 'her').length;
    check('so nobody comes out ahead across the block', `${mine}/${hers}`, '4/4');
  });

  suite('turns: bets, deals and skips', () => {
    check(
      'an extra pick goes to the front of the queue',
      state([w('2026-01-02','A','me'), w('2026-01-09','B','me')], [adj('2026-01-10','grant','me',1,'won the bet')]).upNext,
      'me'
    );
    check(
      'giving up a pick hands over the turn',
      state([w('2026-01-02','A','me')], [adj('2026-01-03','skip','me',1,'passed')]).upNext,
      'her'
    );
    check(
      'multiple bonus picks stack',
      state([], [adj('2026-01-01','grant','her',2,'a deal')]).queue.slice(0, 2).join(','),
      'her,her'
    );
    check('the reason is kept with the adjustment', state([], [adj('2026-01-01','grant','her',1,'a deal')]).events[0].note, 'a deal');
  });

  suite('turns: the replay is deterministic', () => {
    const same = [w('2026-02-01','X','me'), w('2026-02-01','Y','me')];
    check('same-day entries do not depend on input order', state(same).upNext, state([...same].reverse()).upNext);
    check('events are replayed in date order', state([w('2026-03-01','Late','her'), w('2026-01-01','Early','me')]).events[0].date, '2026-01-01');
    check('`through` stops the replay early', state([w('2026-01-02','A','me'), w('2026-06-01','B','me')]).events.length, 2);
    check(
      'and honours the cutoff',
      computeTurnState([w('2026-01-02','A','me'), w('2026-06-01','B','me')], [], config, { through: '2026-03-01' }).events.length,
      1
    );
  });

  suite('turns: backfilled history stays quiet', () => {
    const anchored = { ...config, rotationAnchor: '2026-06-01' };
    const ws = [w('2026-01-02','Old A','me'), w('2026-01-09','Old B','me'), w('2026-01-16','Old C','me')];
    const before = computeTurnState(ws, [], anchored);
    check('an out-of-turn pick before the anchor is not flagged', before.events.at(-1).traded, false);
    check('but it still counts toward the totals', before.used.me, 3);
    check('and it still moves the queue along', before.upNext, 'her');

    const after = computeTurnState([...ws, w('2026-07-01','New','me')], [], anchored);
    check('an out-of-turn pick after the anchor is flagged', after.events.at(-1).traded, true);
    check('with no anchor set, everything is checked', computeTurnState(ws, [], config).events.at(-1).traded, true);
  });

  suite('turns: a pick with no date sits out', () => {
    const undated = (title, picker) => w('', title, picker);
    const s1 = state([w('2026-01-02','A','me'), undated('Lost to time','me')]);
    check('it does not advance the rotation', s1.upNext, 'me');
    check('it is not counted as used', s1.used.me, 1);
    check('but it is reported, not silently dropped', s1.undatedPicks, 1);
    check('a fully dated history reports none', state([w('2026-01-02','A','me')]).undatedPicks, 0);

    const s2 = state([undated('X','me'), undated('Y','her')]);
    check('several are counted', s2.undatedPicks, 2);
    check('and the rotation is untouched', s2.upNext, 'me');

    const joint = { ...w('', 'Theater', 'joint'), venue: 'theater', consumesTurn: false };
    check('a dateless joint watch is not a pending pick', state([joint]).undatedPicks, 0);
  });

  suite('turns: a different household arrangement', () => {
    const oneEach = { ...config, picksPerTurn: 1, rotationStart: 'her' };
    check('one pick each, starting with her', computeTurnState([], [], oneEach).queue.slice(0, 4).join(','), 'her,me,her,me');
  });
}
