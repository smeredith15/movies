import { readJson, writeJson } from './github';

/**
 * What we have said about a movie, as opposed to what a source said.
 *
 * These live apart from the catalogs because the catalogs are regenerated —
 * by the workbook import and by the scraper — and a rebuild must never wipe
 * out a rating or a tick. Same reasoning as data/overrides.json.
 */
export interface Mark {
  seen?: boolean;
  /** 1-10, how much we want to see it. */
  wantToSee?: number | null;
  at: string;
  by: string;
}

export type Marks = Record<string, Mark>;

export const MARKS_PATH = 'data/marks.json';

export const loadMarks = () => readJson<Marks>(MARKS_PATH, {}).then((f) => f.data);

export function saveMarks(changes: Marks, message: string) {
  return writeJson<Marks>(
    MARKS_PATH,
    {},
    (current) => {
      const next = { ...current };
      for (const [id, mark] of Object.entries(changes)) {
        const merged = { ...next[id], ...mark };
        // Keep a mark whenever either field was actually set, including
        // `seen: false` and `wantToSee: null`. Those are decisions — dropping
        // them would let the workbook's value come back.
        if (merged.seen === undefined && merged.wantToSee === undefined) delete next[id];
        else next[id] = merged;
      }
      return next;
    },
    message
  );
}

/** A movie as the app sees it: what the source said, with our marks on top. */
export function applyMark<T extends { id: string; seen?: boolean; wantToSee?: number | null }>(
  movie: T,
  marks: Marks
): T & { seen: boolean; wantToSee: number | null; marked: boolean } {
  const mark = marks[movie.id];
  // `??` would treat a deliberately cleared rating as absent and fall back to
  // the source, making it impossible to unset one the workbook supplied. Ask
  // whether the field was set, not whether it holds a value.
  const hasSeen = mark && mark.seen !== undefined;
  const hasWant = mark && mark.wantToSee !== undefined;
  return {
    ...movie,
    seen: hasSeen ? Boolean(mark.seen) : Boolean(movie.seen),
    wantToSee: hasWant ? (mark.wantToSee ?? null) : (movie.wantToSee ?? null),
    marked: Boolean(mark),
  };
}
