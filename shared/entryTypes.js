// What a ballot entry consists of. Shared by the app and the importer so the
// rules live in one place.

export const ENTRY_TYPES = {
  movie: {
    label: 'A movie',
    hint: 'Pick from the eligible list.',
  },
  person: {
    label: 'An actor or actress',
    hint: 'The list expands to show cast.',
    expandsCast: true,
  },
  character: {
    label: 'A character',
    hint: 'The list expands to show roles.',
    expandsCast: true,
  },
  movieText: {
    label: 'A movie, plus something typed',
    hint: 'Pick a movie, then describe it — a scene, a song, an animal.',
    freeText: true,
  },
  free: {
    label: 'Anything — just type it',
    hint: 'No movie, no list. Whatever the category calls for.',
    freeText: true,
  },
};

export const ENTRY_TYPE_IDS = Object.keys(ENTRY_TYPES);

export const isEntryType = (type) => Object.hasOwn(ENTRY_TYPES, type);

/**
 * Whether an entry of this type has to name a movie.
 *
 *   required — the entry is meaningless without one
 *   optional — a movie can be attached but is not needed. Custom categories
 *              are often about an actor's whole year rather than one
 *              performance, so they must not force a single movie.
 *   none     — the type bypasses the movie list entirely
 */
export function movieRequirement(type, { custom = false } = {}) {
  if (type === 'free') return 'none';
  if (type === 'movie' || type === 'movieText') return 'required';
  return custom ? 'optional' : 'required';
}

export const allowsFreeText = (type) => Boolean(ENTRY_TYPES[type]?.freeText);
export const expandsCast = (type) => Boolean(ENTRY_TYPES[type]?.expandsCast);

/** Is this a usable entry for the given category? */
export function validateEntry(entry, category) {
  const type = entry.type || category.type;
  if (!isEntryType(type)) return { ok: false, reason: `Unknown entry type "${type}".` };

  const needsMovie = movieRequirement(type, { custom: Boolean(category.custom) });
  if (needsMovie === 'required' && !entry.movieId && !entry.writeIn) {
    return { ok: false, reason: 'Pick a movie, or write one in.' };
  }
  if (needsMovie === 'none' && entry.movieId) {
    return { ok: false, reason: 'This type does not take a movie.' };
  }
  if (allowsFreeText(type) && !entry.text?.trim()) {
    return { ok: false, reason: 'Say what it is.' };
  }
  if (!allowsFreeText(type) && type !== 'movie' && !entry.person?.trim() && !entry.writeIn) {
    return { ok: false, reason: 'Name who or what you mean.' };
  }
  return { ok: true, reason: null };
}
