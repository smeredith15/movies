export type Person = 'me' | 'her';
/**
 * 'unknown' is for a viewing we are sure of but cannot attribute — ticking a
 * film as seen says we watched it, not who picked it. Guessing would quietly
 * corrupt the rotation, so it says so instead.
 */
export type Picker = Person | 'joint' | 'unknown';
export type Venue = 'home' | 'theater';
export type Confidence = 'high' | 'medium' | 'low';

export interface Watch {
  id: string;
  /**
   * YYYY-MM-DD, or '' when we know we watched it but not when. An undated
   * watch still records who picked it, but cannot take part in the rotation
   * because there is no way to order it.
   */
  date: string;
  title: string;
  movieId: string | null;  // link into the catalog once matched
  venue: Venue;
  picker: Picker;
  /** Whether this viewing consumed one of the picker's turns. */
  consumesTurn: boolean;
  /**
   * Whether this viewing puts the film on its year's ballot. Left unset the
   * date decides; set, it wins. The old history often records only that we
   * saw something, not when, so the answer has to be stateable directly.
   */
  onBallot?: boolean;
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
  /** Streaming services carrying it, where a source named one. */
  services?: string[];
  /** Poster URL, which firstshowing supplies alongside each link. */
  poster?: string | null;
  /** Cached result of the rules engine, recomputed on every refresh. */
  computedYear?: number | null;
  confidence?: Confidence;
  evidence?: string[];
  /** True when the rules could not settle the year without a person looking. */
  needsReview?: boolean;
  /** What TMDB says it is about, and what kind of film it is. */
  overview?: string | null;
  genres?: string[];
  /**
   * Whether TMDB confirmed a film of this title within a year of the one we
   * think it is. False means the entry is probably television or a bad parse.
   */
  tmdbVerified?: boolean;
  tmdbNote?: string;
  /** Added by hand, so a rebuild must keep it. */
  manual?: boolean;
  /** What the source said. The app layers data/marks.json over these. */
  seen?: boolean;
  owned?: boolean;
  wantToSee?: number | null;
  onFrozenBallot?: boolean;
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
  /** undefined leaves it to the date; a boolean overrides. */
  onBallot?: boolean;
}
