import { check, suite } from './harness.mjs';

export default function run({ buildPool, buildUnwatchedPool, isFilled }, { ballotStatus }) {
  const config = {
    people: { me: 'Me', her: 'Her' },
    picksPerTurn: 2,
    rotationStart: 'me',
    oscarDates: {},
    frozenYears: [2024],
  };

  const movie = (id, year, extra = {}) => ({
    id,
    title: id.replace(/-\d+$/, '').replace(/-/g, ' '),
    computedYear: year,
    ...extra,
  });
  const watch = (movieId, date, extra = {}) => ({
    id: `w-${movieId}`,
    movieId,
    date,
    title: movieId,
    picker: 'me',
    venue: 'home',
    consumesTurn: true,
    ...extra,
  });

  suite('ballot window: the date decides, unless we say otherwise', () => {
    const s = (w) => ballotStatus(w, 2025, {});
    check('watched inside the year', s({ date: '2025-07-04' }).onBallot, true);
    check('watched in the run-up to the ceremony', s({ date: '2026-01-20' }).onBallot, true);
    check('watched on the day itself', s({ date: '2026-03-15' }).onBallot, true);
    check('watched the day after is too late', s({ date: '2026-03-16' }).onBallot, false);
    check('and it says the date decided', s({ date: '2026-03-16' }).source, 'date');

    check('saying yes without a date works', s({ onBallot: true }).onBallot, true);
    check('and is marked as ours', s({ onBallot: true }).source, 'manual');
    check('saying no overrides a date inside the window', s({ date: '2025-07-04', onBallot: false }).onBallot, false);
    check('saying yes overrides a date outside it', s({ date: '2026-06-01', onBallot: true }).onBallot, true);

    check('neither a date nor an answer is unset', s({}).source, 'unset');
    check('and stays off the ballot until answered', s({}).onBallot, false);
    check('the ceremony it turns on is reported', s({}).closes, '2026-03-15');
  });

  suite('pool: an open year fills as we watch', () => {
    const catalog = [movie('a-2025', 2025), movie('b-2025', 2025), movie('c-2025', 2025), movie('d-2024', 2024)];
    const watches = [
      watch('a-2025', '2025-08-01'),
      watch('b-2025', '2026-06-01'), // after the ceremony
      watch('c-2025', '', { onBallot: true }), // no date, said yes
    ];
    const pool = buildPool(2025, catalog, watches, [], {}, config);
    const ids = pool.map((m) => m.id);

    check('a film watched in the window is in', ids.includes('a-2025'), true);
    check('one watched too late is out', ids.includes('b-2025'), false);
    check('one we said we saw in time is in', ids.includes('c-2025'), true);
    check('another year is not', ids.includes('d-2024'), false);
    check('and the pool says why', pool.find((m) => m.id === 'a-2025').reason.includes('2025-08-01'), true);
    check('including when we said so ourselves', pool.find((m) => m.id === 'c-2025').reason.includes('Marked'), true);
  });

  suite('pool: a frozen year is settled', () => {
    const catalog = [
      movie('on-2024', 2024, { onFrozenBallot: true }),
      movie('off-2024', 2024, { onFrozenBallot: false }),
    ];
    // Watched, and inside the window — but the ceremony has been and gone.
    const watches = [watch('off-2024', '2024-08-01')];
    const pool = buildPool(2024, catalog, watches, [], {}, config);

    check('what was on the ballot stays on it', pool.map((m) => m.id).join(','), 'on-2024');
    check('watching it later does not add it', pool.length, 1);
    check('the reason names the ceremony', pool[0].reason.includes('at the ceremony'), true);
  });

  suite('pool: gaps in the record can be fixed by hand', () => {
    const catalog = [movie('missing-2024', 2024, { onFrozenBallot: false }), movie('on-2024', 2024, { onFrozenBallot: true })];
    const added = buildPool(2024, catalog, [], [], { 2024: { added: ['missing-2024'] } }, config);
    check('a film added by hand joins a frozen ballot', added.map((m) => m.id).sort().join(','), 'missing-2024,on-2024');
    check('and says it was added', added.find((m) => m.id === 'missing-2024').reason.includes('by hand'), true);

    const removed = buildPool(2024, catalog, [], [], { 2024: { removed: ['on-2024'] } }, config);
    check('and one can be taken off', removed.length, 0);
  });

  suite('pool: a year override moves a film between ballots', () => {
    const catalog = [movie('late-2026', 2026)];
    const watches = [watch('late-2026', '2026-01-10')];
    const overrides = [{ movieId: 'late-2026', eligibilityYear: 2025, at: 'x', by: 'me' }];

    check('it leaves the year the rules gave it', buildPool(2026, catalog, watches, overrides, {}, config).length, 0);
    check('and joins the one we chose', buildPool(2025, catalog, watches, overrides, {}, config).length, 1);
    check('an excluded film joins neither', buildPool(2026, catalog, watches, [{ movieId: 'late-2026', excluded: true, at: 'x', by: 'me' }], {}, config).length, 0);
  });

  suite('pool: the films we did not see', () => {
    const catalog = [movie('seen-2025', 2025), movie('missed-2025', 2025), movie('other-2024', 2024)];
    const pool = buildPool(2025, catalog, [watch('seen-2025', '2025-05-05')], [], {}, config);
    const unwatched = buildUnwatchedPool(2025, catalog, pool);
    check('holds the year’s films we missed', unwatched.map((m) => m.id).join(','), 'missed-2025');
    check('and excludes other years', unwatched.some((m) => m.id === 'other-2024'), false);
  });

  suite('ballot: what counts as a filled slot', () => {
    check('a movie', isFilled({ movieId: 'dune-2021' }), true);
    check('a write-in', isFilled({ writeIn: 'Something obscure' }), true);
    check('a person', isFilled({ person: 'Someone' }), true);
    check('typed text', isFilled({ text: 'the ornithopter scene' }), true);
    check('nothing at all', isFilled({}), false);
    check('an absent entry', isFilled(undefined), false);
    check('whitespace is not an answer', isFilled({ text: '   ' }), false);
  });
}
