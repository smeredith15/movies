import { readJson, writeJson } from './github';
import { loadCatalogWithCast } from './store';
import type { CatalogMovie, Config, EligibilityOverride, Person, Watch } from './types';
import { ballotStatus } from '../../shared/eligibility.js';

/** One slot on a ballot: a winner, or one of four honorable mentions. */
export interface Entry {
  movieId?: string | null;
  /** An actor or a character, depending on the category. */
  person?: string;
  /** The typed part: a scene, a song, an animal, anything at all. */
  text?: string;
  /** Something not in the pool. */
  writeIn?: string;
}

export interface CategoryBallot {
  /** Custom categories carry their own name and type, chosen on the day. */
  name?: string;
  type?: string;
  winner?: Entry;
  mentions?: Entry[];
}

export interface Ballot {
  year: number;
  person: Person;
  submitted: boolean;
  entries: Record<string, CategoryBallot>;
  updatedAt?: string;
}

export interface BallotCategory {
  id: string;
  name: string;
  type: string;
  pool: 'watched' | 'unwatched';
  slots: { winner: number; honorableMentions: number };
  scoring: { winner: number; honorableMentions: number[] };
  scored: boolean;
  allowWriteIn: boolean;
  textLabel?: string;
  custom?: boolean;
  nameEditable?: boolean;
  typeEditable?: boolean;
  allowedTypes?: string[];
  perPerson?: boolean;
  namePlaceholder?: string;
}

/** Movies forced onto, or off, a year's ballot after the fact. */
export interface BallotExtras {
  [year: string]: { added?: string[]; removed?: string[] };
}

export const CATEGORIES_PATH = 'data/categories.json';
export const EXTRAS_PATH = 'data/ballot-extras.json';
export const ballotPath = (year: number, person: Person) => `data/ballots/${year}.${person}.json`;

export const loadCategories = () =>
  readJson<BallotCategory[]>(CATEGORIES_PATH, []).then((f) => f.data);

export const loadExtras = () => readJson<BallotExtras>(EXTRAS_PATH, {}).then((f) => f.data);

export const loadBallot = (year: number, person: Person) =>
  readJson<Ballot>(ballotPath(year, person), {
    year,
    person,
    submitted: false,
    entries: {},
  }).then((f) => f.data);

export function saveBallot(ballot: Ballot) {
  return writeJson<Ballot>(
    ballotPath(ballot.year, ballot.person),
    ballot,
    () => ({ ...ballot, updatedAt: new Date().toISOString() }),
    `Update ${ballot.year} ballot`
  );
}

export function saveExtras(year: number, change: { added?: string[]; removed?: string[] }, message: string) {
  return writeJson<BallotExtras>(
    EXTRAS_PATH,
    {},
    (current) => ({
      ...current,
      [year]: {
        added: [...new Set([...(current[year]?.added ?? []), ...(change.added ?? [])])],
        removed: [...new Set([...(current[year]?.removed ?? []), ...(change.removed ?? [])])],
      },
    }),
    message
  );
}

export interface PoolMovie extends CatalogMovie {
  /** Why this film is on the ballot, for when the answer is surprising. */
  reason: string;
}

/**
 * The films eligible for a year's ballot.
 *
 * A frozen year is settled: its pool is whatever was on the ballot at the
 * ceremony, and only a deliberate addition changes it. An open year is still
 * accumulating — a film qualifies once we have watched it inside the window,
 * which the viewing decides either by its date or by saying so outright.
 *
 * Either way a manual addition wins, because a film missing from a sheet is a
 * gap in the record rather than a ruling.
 */
export function buildPool(
  year: number,
  catalog: CatalogMovie[],
  watches: Watch[],
  overrides: EligibilityOverride[],
  extras: BallotExtras,
  config: Config
): PoolMovie[] {
  const frozen = (config.frozenYears ?? []).includes(year);
  const overrideFor = new Map(overrides.map((o) => [o.movieId, o]));
  const added = new Set(extras[year]?.added ?? []);
  const removed = new Set(extras[year]?.removed ?? []);

  const watchFor = new Map<string, Watch>();
  for (const w of watches) if (w.movieId) watchFor.set(w.movieId, w);

  const pool: PoolMovie[] = [];

  for (const movie of catalog) {
    if (removed.has(movie.id)) continue;

    const override = overrideFor.get(movie.id);
    if (override?.excluded) continue;
    const filmYear = override?.eligibilityYear ?? movie.computedYear ?? null;

    if (added.has(movie.id)) {
      pool.push({ ...movie, reason: 'Added to this ballot by hand.' });
      continue;
    }

    if (filmYear !== year) continue;

    if (frozen) {
      if (movie.onFrozenBallot) {
        pool.push({ ...movie, reason: `On the ${year} ballot at the ceremony.` });
      }
      continue;
    }

    const watch = watchFor.get(movie.id);
    if (!watch) continue;

    const status = ballotStatus(watch, year, config.oscarDates ?? {});
    if (!status.onBallot) continue;

    pool.push({
      ...movie,
      reason:
        status.source === 'manual'
          ? 'Marked as watched inside the ballot window.'
          : `Watched ${watch.date}, before the ${year} ceremony on ${status.closes}.`,
    });
  }

  return pool.sort((a, b) => a.title.localeCompare(b.title));
}

/** Films of the right year we did *not* see — one category runs on these. */
export function buildUnwatchedPool(
  year: number,
  catalog: CatalogMovie[],
  pool: PoolMovie[]
): CatalogMovie[] {
  const inPool = new Set(pool.map((m) => m.id));
  return catalog
    .filter((m) => m.computedYear === year && !inPool.has(m.id))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const loadFullCatalog = (year: number) => loadCatalogWithCast(year);

/** A filled slot, for counting progress without judging content. */
export const isFilled = (entry?: Entry) =>
  Boolean(entry && (entry.movieId || entry.person?.trim() || entry.text?.trim() || entry.writeIn?.trim()));

export function ballotProgress(ballot: Ballot, categories: BallotCategory[]) {
  let filled = 0;
  for (const c of categories) {
    if (isFilled(ballot.entries[c.id]?.winner)) filled += 1;
  }
  return { filled, total: categories.length };
}
