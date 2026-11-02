/**
 * The order two things that happened on the same day are in.
 *
 * Every list that shows watches chronologically sorted with
 * `a.date < b.date ? 1 : -1`, which answers "a comes first" for two entries on
 * the same date — a comparator that never returns 0 for equals, so the engine
 * is free to put them in any order at all, and in practice reverses them. Two
 * films logged on one evening came out newest-first inside a day that was
 * itself newest-first.
 *
 * Ids settle it, because `newId` starts them with a base36 millisecond stamp:
 * ascending id is the order they were logged in. `seq` overrides that for a
 * day someone has put in hand — an evening is not always logged in the order
 * it was watched.
 */
export interface Ordered {
  date: string;
  id: string;
  /** Position within its own day, set only on a day ordered by hand. */
  seq?: number | null;
}

/**
 * Where two entries on the same day sit relative to each other: oldest first.
 *
 * An entry with no `seq` sorts after every entry that has one, because a day
 * is numbered all at once and anything unnumbered arrived afterwards.
 */
export function withinDay(a: Ordered, b: Ordered): number {
  const sa = a.seq ?? Number.POSITIVE_INFINITY;
  const sb = b.seq ?? Number.POSITIVE_INFINITY;
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/** Oldest first. What the rotation replays. */
export function oldestFirst<T extends Ordered>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.date === b.date ? withinDay(a, b) : a.date < b.date ? -1 : 1));
}

/**
 * Newest day first, but oldest first within a day — which is how a list of
 * evenings reads: this week before last week, but the early film before the
 * late one. Undated entries trail, having no place in the order at all.
 */
export function newestDayFirst<T extends Ordered>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.date || !b.date) {
      if (a.date === b.date) return withinDay(a, b);
      return a.date ? -1 : 1;
    }
    return a.date === b.date ? withinDay(a, b) : a.date < b.date ? 1 : -1;
  });
}

/**
 * Move one entry up or down within its own day.
 *
 * Returns every entry in that day, renumbered — not just the two that swapped.
 * A day where only some entries carry a `seq` is a day ordered half by hand
 * and half by when it happened to be logged, which is the ambiguity this is
 * here to remove. Nothing is returned when the move would fall off either end,
 * so a disabled button that is pressed anyway saves nothing.
 */
export function moveWithinDay<T extends Ordered>(items: T[], id: string, delta: -1 | 1): T[] {
  const target = items.find((w) => w.id === id);
  if (!target?.date) return [];

  const day = oldestFirst(items.filter((w) => w.date === target.date));
  const from = day.findIndex((w) => w.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= day.length) return [];

  [day[from], day[to]] = [day[to], day[from]];
  return day.map((w, i) => ({ ...w, seq: i }));
}

/** Whether an entry has anything to be reordered against. */
export function sharesItsDay(items: Ordered[], w: Ordered): boolean {
  return Boolean(w.date) && items.filter((x) => x.date === w.date).length > 1;
}
