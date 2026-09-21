export type Person = 'me' | 'her';
export type Picker = Person | 'joint';
export type Venue = 'home' | 'theater';
export type Confidence = 'high' | 'medium' | 'low';

export interface Watch {
  id: string;
  date: string;            // YYYY-MM-DD
  title: string;
  movieId: string | null;  // link into the catalog once matched
  venue: Venue;
  picker: Picker;
  /** Whether this viewing consumed one of the picker's turns. */
  consumesTurn: boolean;
  note?: string;
}

export type AdjustmentType = 'grant' | 'skip';

export interface Adjustment {
  id: string;
  date: string;
  type: AdjustmentType;
  who: Person;
  count: number;
  note?: string;
}

export interface Ratings {
  imdb?: number | null;
  metacritic?: number | null;
  rtCritic?: number | null;
  rtAudience?: number | null;
}

export interface CastMember {
  name: string;
  character?: string;
  order?: number;
}

export interface CatalogMovie {
  id: string;
  title: string;
  kind: 'theatrical' | 'streaming' | 'rerelease' | 'event';
  festivalDate?: string | null;
  usLimitedDate?: string | null;
  usTheatricalDate?: string | null;
  homeDate?: string | null;
  isForeignLanguage?: boolean;
  isDocumentary?: boolean;
  oscarNominated?: boolean;
  hadUSTheatricalRelease?: boolean;
  ratings?: Ratings;
  cast?: CastMember[];
  imdbId?: string | null;
  tmdbId?: number | null;
  sources: string[];
  /** Cached result of the rules engine, recomputed on every refresh. */
  computedYear?: number | null;
  confidence?: Confidence;
  evidence?: string[];
}

export interface EligibilityOverride {
  movieId: string;
  eligibilityYear?: number | null;
  excluded?: boolean;
  note?: string;
  at: string;
  by: string;
}

export interface Config {
  people: Record<Person, string>;
  picksPerTurn: number;
  rotationStart: Person;
  /**
   * Picks before this date are recorded but not checked against the rotation,
   * so backfilled history does not get flagged as a string of trades.
   */
  rotationAnchor?: string | null;
  /** Keyed by ceremony year, overrides the built-in table. */
  oscarDates: Record<string, string>;
  /** Film years whose ballot pool has been frozen at the ceremony. */
  frozenYears: number[];
}

/** A history row that has been filled in but not yet committed. */
export interface StagedWatch {
  date: string;
  picker: Picker;
  venue: Venue;
}
