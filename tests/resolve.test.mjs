import { check, suite } from './harness.mjs';

/** A TMDB client that answers from a table rather than the network. */
function fakeTmdb(byId) {
  return { details: async (id) => byId[id] ?? null };
}

const DIGGER = {
  id: 1234567,
  title: 'Digger',
  imdb_id: 'tt9999999',
  overview: 'A man digs.',
  original_language: 'es',
  genres: [{ name: 'Drama' }],
  release_dates: {
    results: [
      {
        iso_3166_1: 'US',
        release_dates: [{ type: 3, release_date: '2026-11-20T00:00:00.000Z' }],
      },
    ],
  },
  credits: { cast: [{ name: 'Someone', character: 'Him', order: 0 }] },
};

export default async function run({ parseOnly, applyDetails }, { newestSince, runProgress }) {
  suite('--only: naming the entries to resolve', () => {
    check('a single id', [...parseOnly('digger-2026')].join(), 'digger-2026');
    check('commas', [...parseOnly('a-2026,b-2026')].join(), 'a-2026,b-2026');
    check('commas and spaces', [...parseOnly('a-2026, b-2026')].join(), 'a-2026,b-2026');
    check('an empty string names nothing', parseOnly(''), null);
    check('and so does a missing flag', parseOnly(undefined), null);
    check('a stray comma does not become an id', [...parseOnly('a-2026,,')].length, 1);
  });

  await suite('a pinned id corrects the title; a searched one does not', async () => {
    const tmdb = fakeTmdb({ 1234567: DIGGER });

    const pinned = { id: 'inarrituss-digger-2026', title: "Inarritu's Digger" };
    check('the detail landed', await applyDetails(tmdb, pinned, 1234567, { rename: true }), true);
    check('the title is now the film’s', pinned.title, 'Digger');
    check('what the schedule called it is kept', pinned.titleWas, "Inarritu's Digger");
    check('the id is untouched', pinned.id, 'inarrituss-digger-2026');
    check('the overview arrived', pinned.overview, 'A man digs.');
    check('and the dates', pinned.usTheatricalDate, '2026-11-20');
    check('and the cast', pinned.cast.length, 1);
    check('foreign language was noticed', pinned.isForeignLanguage, true);

    // The search already required the titles to agree, so renaming there would
    // only let every near-miss start rewriting the catalog.
    const searched = { id: 'digger-2026', title: 'Digger (2026)' };
    await applyDetails(tmdb, searched, 1234567);
    check('a searched match keeps its title', searched.title, 'Digger (2026)');
    check('and records no former one', searched.titleWas, undefined);
  });

  await suite('a rename only happens when there is something to rename', async () => {
    const tmdb = fakeTmdb({ 1234567: DIGGER });
    const same = { id: 'digger-2026', title: 'Digger' };
    await applyDetails(tmdb, same, 1234567, { rename: true });
    check('an identical title is not recorded as a former one', same.titleWas, undefined);

    const missing = { id: 'ghost-2026', title: 'Ghost' };
    check('an id TMDB does not know fails', await applyDetails(tmdb, missing, 42, { rename: true }), false);
    check('and the title is left alone', missing.title, 'Ghost');
  });

  suite('finding the run a dispatch created', () => {
    const runs = [
      { created_at: '2026-10-05T12:00:30Z', which: 'new' },
      { created_at: '2026-10-05T11:00:00Z', which: 'old' },
    ];
    check('the newer run is found', newestSince(runs, '2026-10-05T12:00:29Z').which, 'new');
    // Reporting the previous run's success as this one's is the one answer
    // that would be worse than no answer at all.
    check('nothing newer means nothing', newestSince([runs[1]], '2026-10-05T12:00:29Z'), null);
    // created_at has one-second resolution, so same-second must still count.
    check(
      'a run created in the same second counts',
      newestSince([{ created_at: '2026-10-05T12:00:30Z', which: 'new' }], '2026-10-05T12:00:30Z')
        .which,
      'new'
    );
    check('an empty list is not a run', newestSince([], '2026-10-05T12:00:29Z'), null);
  });

  suite('what to say about a run, and when to stop asking', () => {
    const p = (run) => runProgress(run);
    check('no run yet keeps us asking', p(null).done, false);
    check('a queued run keeps us asking', p({ status: 'queued', conclusion: null }).done, false);
    check('so does one in progress', p({ status: 'in_progress', conclusion: null }).done, false);

    const ok = p({ status: 'completed', conclusion: 'success' });
    check('success is done', ok.done, true);
    check('and is success', ok.ok, true);

    const bad = p({ status: 'completed', conclusion: 'failure' });
    check('a failure is done', bad.done, true);
    check('but is not success', bad.ok, false);
    check('and says so', bad.note, 'The run failure.');

    const killed = p({ status: 'completed', conclusion: 'cancelled' });
    check('a cancelled run is not treated as success', killed.ok, false);
  });
}
