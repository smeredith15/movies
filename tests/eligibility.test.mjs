import { check, suite } from './harness.mjs';
import {
  computeEligibility,
  isOscarDateEstimated,
  oscarDateForFilmYear,
  passesInclusionGate,
  seasonsContaining,
  resolveEligibility,
  watchFallsInSeason,
} from '../shared/eligibility.js';

export default function run() {
  suite('eligibility: which year does a movie belong to', () => {
    const y = (m) => computeEligibility(m).year;

    check('a plain wide release', y({ usTheatricalDate: '2026-06-12' }), 2026);
    check('a festival premiere does not anchor the year', y({ festivalDate: '2025-09-05', usTheatricalDate: '2026-02-20' }), 2026);
    check('Dec limited expanding before the Oscars stays put', y({ usLimitedDate: '2025-12-25', usTheatricalDate: '2026-01-16' }), 2025);
    check('Dec limited expanding after the Oscars rolls over', y({ usLimitedDate: '2025-12-25', usTheatricalDate: '2026-06-01' }), 2026);
    check('straight to streaming', y({ homeDate: '2026-04-03' }), 2026);
    check('a re-release is excluded', y({ usTheatricalDate: '2026-05-01', kind: 'rerelease' }), null);
    check('a festival-only title is undecidable', y({ festivalDate: '2026-09-05' }), null);
    check('nothing at all is undecidable', y({}), null);

    check('a clean release is high confidence', computeEligibility({ usTheatricalDate: '2026-06-12' }).confidence, 'high');
    check('a cross-year call is medium confidence', computeEligibility({ usLimitedDate: '2025-12-25', usTheatricalDate: '2026-01-16' }).confidence, 'medium');
    check('the reasoning is recorded', computeEligibility({ usTheatricalDate: '2026-06-12' }).evidence.length > 0, true);
  });

  suite('eligibility: the inclusion gate for foreign films and docs', () => {
    const gate = (m, f) => passesInclusionGate(m, f).included;
    check('an ordinary film needs no excuse', gate({}, {}), true);
    check('a doc we watched is in', gate({ isDocumentary: true }, { watched: true }), true);
    check('a nominated doc is in', gate({ isDocumentary: true, oscarNominated: true }, {}), true);
    check('a foreign film with a US run is in', gate({ isForeignLanguage: true, hadUSTheatricalRelease: true }, {}), true);
    check('an unseen streaming-only doc is out', gate({ isDocumentary: true }, {}), false);
  });

  suite('eligibility: the 15-month season window', () => {
    check('the 2026 season closes at the 2027 ceremony', oscarDateForFilmYear(2026), '2027-03-14');
    check('announced dates are not flagged as estimates', isOscarDateEstimated(2026), false);
    check('far-future dates are flagged as estimates', isOscarDateEstimated(2030), true);
    check('a January watch still counts for the prior year', watchFallsInSeason('2027-02-01', 2026), true);
    check('a watch after the ceremony does not', watchFallsInSeason('2027-04-01', 2026), false);
    check('February sits inside two open seasons', seasonsContaining('2026-02-10').join(','), '2026,2025');
    check('October sits inside one', seasonsContaining('2026-10-10').join(','), '2026');
  });

  suite('eligibility: the cases that need a person', () => {
    const v = (m) => computeEligibility(m);

    // A late-year limited run is undecidable until it expands or reaches home:
    // which side of the ceremony that lands on decides the year.
    check('a December limited run with no expansion is low confidence', v({ usLimitedDate: '2025-12-20' }).confidence, 'low');
    check('and is flagged for review', v({ usLimitedDate: '2025-12-20' }).needsReview, true);
    check('November counts as late too', v({ usLimitedDate: '2025-11-14' }).needsReview, true);
    check('but a spring limited run does not', Boolean(v({ usLimitedDate: '2025-03-14' }).needsReview), false);
    check('and it stays medium', v({ usLimitedDate: '2025-03-14' }).confidence, 'medium');
    check('the reasoning names the ceremony it turns on', v({ usLimitedDate: '2025-12-20' }).evidence.join(' ').includes('Oscars'), true);

    // Once the expansion date is known there is nothing to decide, though it
    // is still worth marking as a cross-year call.
    check('a resolved cross-year case is not flagged for review', Boolean(v({ usLimitedDate: '2025-12-20', usTheatricalDate: '2026-01-16' }).needsReview), false);
    check('but is marked as cross-year', v({ usLimitedDate: '2025-12-20', usTheatricalDate: '2026-01-16' }).crossYear, true);
    check('a plain release is neither', Boolean(v({ usTheatricalDate: '2026-06-12' }).crossYear), false);
    check('and stays high confidence', v({ usTheatricalDate: '2026-06-12' }).confidence, 'high');
  });

  suite('eligibility: a manual override always wins', () => {
    const movie = { usTheatricalDate: '2026-06-12' };
    check('a year override replaces the computed year', resolveEligibility(movie, { eligibilityYear: 2025 }).year, 2025);
    check('an override is marked as such', resolveEligibility(movie, { eligibilityYear: 2025 }).overridden, true);
    check('exclusion drops it entirely', resolveEligibility(movie, { excluded: true }).year, null);
    check('no override leaves the computed answer', resolveEligibility(movie, null).year, 2026);
    check('an override matching the computation is not flagged', resolveEligibility(movie, { eligibilityYear: 2026 }).overridden, false);
  });
}
