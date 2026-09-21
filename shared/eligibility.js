// Eligibility rules. Imported by BOTH the browser app and the Node scraper,
// so it stays dependency-free and uses only plain ESM.

/**
 * Oscar ceremony dates. The ceremony in year Y+1 closes the ballot for film year Y.
 * Dates through 2026 are announced; later years are estimated and flagged as such.
 * Override any of these in data/config.json -> oscarDates.
 */
export const KNOWN_OSCAR_DATES = {
  2020: '2020-02-09',
  2021: '2021-04-25',
  2022: '2022-03-27',
  2023: '2023-03-12',
  2024: '2024-03-10',
  2025: '2025-03-02',
  2026: '2026-03-15',
  2027: '2027-03-14',
};

/** Second Sunday in March, used when a ceremony date is not yet announced. */
function estimatedOscarDate(ceremonyYear) {
  const d = new Date(Date.UTC(ceremonyYear, 2, 1));
  const firstSunday = 1 + ((7 - d.getUTCDay()) % 7);
  const day = firstSunday + 7;
  return `${ceremonyYear}-03-${String(day).padStart(2, '0')}`;
}

/** The ceremony that closes the ballot for `filmYear` (held the following year). */
export function oscarDateForFilmYear(filmYear, overrides = {}) {
  const ceremonyYear = filmYear + 1;
  return (
    overrides[ceremonyYear] ||
    KNOWN_OSCAR_DATES[ceremonyYear] ||
    estimatedOscarDate(ceremonyYear)
  );
}

export function isOscarDateEstimated(filmYear, overrides = {}) {
  const ceremonyYear = filmYear + 1;
  return !overrides[ceremonyYear] && !KNOWN_OSCAR_DATES[ceremonyYear];
}

const yearOf = (iso) => (iso ? Number(iso.slice(0, 4)) : null);
const earliest = (...dates) => dates.filter(Boolean).sort()[0] || null;

/**
 * Compute the year a movie is eligible on, per the house rules:
 *
 *  - A festival premiere never anchors the year; only a US release does.
 *  - Normally the year is the year it became reasonably available to us at
 *    home, i.e. the earlier of its expanded/wide theatrical run or its
 *    home/streaming release.
 *  - Exception (rule 4): a movie that opened limited in year Y and only
 *    expanded in Y+1 still counts for Y, provided that expansion or home
 *    release landed before the Oscars that close year Y.
 *
 * Returns { year, confidence, evidence } — never throws, returns year: null
 * when there is not enough information to decide.
 */
export function computeEligibility(movie, opts = {}) {
  const oscarOverrides = opts.oscarDates || {};
  const evidence = [];

  const {
    festivalDate = null,
    usLimitedDate = null,
    usTheatricalDate = null, // wide / expanded
    homeDate = null, // streaming or physical home release
    kind = 'theatrical',
  } = movie;

  if (kind === 'rerelease' || kind === 'event') {
    return {
      year: null,
      confidence: 'low',
      evidence: [`Looks like a ${kind}, not a new release — excluded by default.`],
    };
  }

  const availability = earliest(usTheatricalDate, homeDate);
  const firstUSRelease = earliest(usLimitedDate, usTheatricalDate, homeDate);

  if (!firstUSRelease) {
    if (festivalDate) {
      return {
        year: null,
        confidence: 'low',
        evidence: [
          `Only a festival date (${festivalDate}) is known. A festival premiere does not set the year — needs a US release date.`,
        ],
      };
    }
    return { year: null, confidence: 'low', evidence: ['No US release date found.'] };
  }

  if (festivalDate && yearOf(festivalDate) < yearOf(firstUSRelease)) {
    evidence.push(
      `Premiered at a festival in ${yearOf(festivalDate)}, but festival dates do not anchor the year.`
    );
  }

  const firstYear = yearOf(firstUSRelease);
  const availYear = availability ? yearOf(availability) : null;

  // Straightforward case: it became available the same year it first opened.
  if (availYear === null || availYear === firstYear) {
    evidence.push(
      availability
        ? `Available in the US on ${availability}.`
        : `First US release ${firstUSRelease}; no expanded or home date found yet.`
    );
    return {
      year: firstYear,
      confidence: availability ? 'high' : 'medium',
      evidence,
    };
  }

  // Cross-year case: opened limited in firstYear, expanded/home in a later year.
  const cutoff = oscarDateForFilmYear(firstYear, oscarOverrides);
  if (availability <= cutoff) {
    evidence.push(
      `Opened limited ${usLimitedDate || firstUSRelease} (${firstYear}) and expanded ${availability}, before the ${firstYear} Oscars on ${cutoff} — counts as ${firstYear}.`
    );
    return { year: firstYear, confidence: 'medium', evidence };
  }

  evidence.push(
    `Opened limited ${usLimitedDate || firstUSRelease} (${firstYear}) but did not expand until ${availability}, after the ${firstYear} Oscars on ${cutoff} — rolls to ${availYear}.`
  );
  return { year: availYear, confidence: 'medium', evidence };
}

/**
 * Rule 5 gate. Foreign-language films and documentaries are only in the pool
 * if they earned their way in; everything else is in by default.
 */
export function passesInclusionGate(movie, facts = {}) {
  const gated = movie.isForeignLanguage || movie.isDocumentary;
  if (!gated) return { included: true, reason: null };

  const label = movie.isDocumentary ? 'Documentary' : 'Foreign-language film';

  if (facts.watched) {
    return { included: true, reason: `${label}, included because we watched it.` };
  }
  if (movie.oscarNominated) {
    return { included: true, reason: `${label} with an Oscar nomination.` };
  }
  if (movie.hadUSTheatricalRelease) {
    return { included: true, reason: `${label} with a US theatrical release.` };
  }
  return {
    included: false,
    reason: `${label} with no US theatrical release, Oscar nomination, or viewing by us.`,
  };
}

/**
 * Rule 3 window: a watch counts toward film year Y if it happened between
 * 1 Jan Y and the ceremony that closes Y — roughly a 15-month season.
 */
export function watchWindowForFilmYear(filmYear, oscarOverrides = {}) {
  return {
    start: `${filmYear}-01-01`,
    end: oscarDateForFilmYear(filmYear, oscarOverrides),
  };
}

export function watchFallsInSeason(watchDate, filmYear, oscarOverrides = {}) {
  const { start, end } = watchWindowForFilmYear(filmYear, oscarOverrides);
  return watchDate >= start && watchDate <= end;
}

/** The film-year season(s) a given date falls inside. Seasons overlap Jan–Mar. */
export function seasonsContaining(date, oscarOverrides = {}) {
  const y = yearOf(date);
  return [y, y - 1].filter((fy) => watchFallsInSeason(date, fy, oscarOverrides));
}

/**
 * Final resolution for one movie: applies stored overrides on top of the
 * computed answer so a manual decision always wins.
 */
export function resolveEligibility(movie, override, opts = {}) {
  const computed = computeEligibility(movie, opts);
  if (!override) return { ...computed, source: 'computed', overridden: false };

  if (override.excluded) {
    return {
      year: null,
      confidence: 'high',
      evidence: [
        ...computed.evidence,
        `Manually excluded${override.note ? `: ${override.note}` : '.'}`,
      ],
      source: 'override',
      overridden: true,
    };
  }
  if (override.eligibilityYear != null && override.eligibilityYear !== computed.year) {
    return {
      year: override.eligibilityYear,
      confidence: 'high',
      evidence: [
        ...computed.evidence,
        `Manually set to ${override.eligibilityYear}${override.note ? `: ${override.note}` : '.'}`,
      ],
      source: 'override',
      overridden: true,
    };
  }
  return { ...computed, source: 'computed', overridden: false };
}
