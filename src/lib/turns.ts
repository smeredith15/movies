import type { Adjustment, Config, Person, Watch } from './types';

export interface TurnEvent {
  date: string;
  kind: 'watch' | 'grant' | 'skip';
  description: string;
  /** Who the rotation expected to pick, before this event was applied. */
  expected: Person | null;
  /** Who actually picked (watch events only). */
  actual: Person | null;
  /** True when someone picked out of turn — i.e. an implicit trade. */
  traded: boolean;
  note?: string;
}

export interface TurnState {
  /** Whose pick is up next. */
  upNext: Person;
  /** The next several entitlements, in order. */
  queue: Person[];
  /** Turn-consuming picks each person has actually made. */
  used: Record<Person, number>;
  /** Picks each person is currently owed beyond the plain rotation. */
  owed: Record<Person, number>;
  /** Picks recorded without a date, which cannot be placed in the sequence. */
  undatedPicks: number;
  /** Picks made before the rotation anchor, kept as history but not counted. */
  beforeAnchor: number;
  events: TurnEvent[];
}

/**
 * The rotation is a repeating block — two for me, two for her by default —
 * expressed as a lazy stream of entitlements we can draw from as needed.
 */
function makeRotation(config: Config) {
  const { picksPerTurn, rotationStart } = config;
  const other: Person = rotationStart === 'me' ? 'her' : 'me';
  const block: Person[] = [
    ...Array<Person>(picksPerTurn).fill(rotationStart),
    ...Array<Person>(picksPerTurn).fill(other),
  ];
  let i = 0;
  return () => block[i++ % block.length];
}

/** Chronological order, with a stable tiebreak so same-day events replay consistently. */
function chronological<T extends { date: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

/**
 * Replay the whole history to derive whose turn it is.
 *
 * The key idea: we never ask "did they pick in the right order". We keep a
 * queue of who is *owed* a pick, and a pick by person P cancels the first
 * entitlement belonging to P. Anyone ahead of P in the queue keeps their
 * place, so picking out of turn is absorbed as a trade automatically — which
 * is what actually happens when you swap to catch a movie before it leaves.
 */
export function computeTurnState(
  watches: Watch[],
  adjustments: Adjustment[],
  config: Config,
  opts: { through?: string } = {}
): TurnState {
  const nextFromRotation = makeRotation(config);
  const queue: Person[] = [];
  const used: Record<Person, number> = { me: 0, her: 0 };
  const events: TurnEvent[] = [];

  const ensure = (n: number) => {
    while (queue.length < n) queue.push(nextFromRotation());
  };

  type Item =
    | ({ _kind: 'watch' } & Watch)
    | ({ _kind: 'adjustment' } & Adjustment);

  const turnPicks = watches.filter((w) => w.consumesTurn && w.picker !== 'joint');

  // An undated pick has no place in the sequence — it is counted and reported
  // separately rather than being guessed into an order.
  const undatedPicks = turnPicks.filter((w) => !w.date).length;

  // The anchor is where the two-and-two rotation begins. Picks before it are
  // history: they stay in the record but do not decide whose turn it is now.
  const anchor = config.rotationAnchor || null;
  const dated = turnPicks.filter((w) => w.date);
  const datedPicks = anchor ? dated.filter((w) => w.date >= anchor) : dated;
  const beforeAnchor = dated.length - datedPicks.length;

  const timeline: Item[] = chronological([
    ...datedPicks.map((w) => ({ ...w, _kind: 'watch' as const })),
    ...adjustments
      .filter((a) => !anchor || a.date >= anchor)
      .map((a) => ({ ...a, _kind: 'adjustment' as const })),
  ] as Item[]);

  for (const item of timeline) {
    if (opts.through && item.date > opts.through) break;
    ensure(1);
    const expected = queue[0];

    if (item._kind === 'watch') {
      const actual = item.picker as Person;
      // Find this person's first outstanding entitlement, extending the
      // rotation until we find one. Bounded: the block always contains both.
      let idx = queue.indexOf(actual);
      let guard = 0;
      while (idx === -1 && guard++ < 16) {
        ensure(queue.length + 1);
        idx = queue.indexOf(actual);
      }
      if (idx >= 0) queue.splice(idx, 1);
      used[actual] += 1;

      events.push({
        date: item.date,
        kind: 'watch',
        description: `${item.title} — picked by ${config.people[actual]}`,
        expected,
        actual,
        traded: expected !== actual,
        note: item.note,
      });
    } else if (item.type === 'grant') {
      // A bonus pick jumps the queue: you won the bet, you pick next.
      queue.unshift(...Array<Person>(item.count).fill(item.who));
      events.push({
        date: item.date,
        kind: 'grant',
        description: `${config.people[item.who]} gains ${item.count} pick${item.count === 1 ? '' : 's'}`,
        expected,
        actual: null,
        traded: false,
        note: item.note,
      });
    } else {
      let removed = 0;
      let guard = 0;
      while (removed < item.count && guard++ < 64) {
        let idx = queue.indexOf(item.who);
        if (idx === -1) {
          ensure(queue.length + 1);
          idx = queue.indexOf(item.who);
        }
        if (idx === -1) break;
        queue.splice(idx, 1);
        removed += 1;
      }
      events.push({
        date: item.date,
        kind: 'skip',
        description: `${config.people[item.who]} skips ${removed} pick${removed === 1 ? '' : 's'}`,
        expected,
        actual: null,
        traded: false,
        note: item.note,
      });
    }
  }

  ensure(6);

  // "Owed" = entitlements sitting in the queue ahead of where the plain
  // rotation would have them, i.e. the backlog each person has built up.
  const owed: Record<Person, number> = { me: 0, her: 0 };
  const lookahead = queue.slice(0, 4);
  for (const p of lookahead) owed[p] += 1;

  return { upNext: queue[0], queue: queue.slice(0, 6), used, owed, undatedPicks, beforeAnchor, events };
}

/** One-line summary for the top of the tracker. */
export function describeTurn(state: TurnState, config: Config): string {
  const name = config.people[state.upNext];
  const run = state.queue.findIndex((p) => p !== state.upNext);
  const consecutive = run === -1 ? state.queue.length : run;
  return consecutive > 1
    ? `${name} is up — ${consecutive} picks in a row`
    : `${name} is up`;
}
