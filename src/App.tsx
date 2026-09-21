import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Adjustment, Config, Watch } from './lib/types';
import { computeTurnState } from './lib/turns';
import {
  DEFAULT_CONFIG,
  loadSnapshot,
  saveAdjustments,
  saveConfig,
  saveWatches,
  type Snapshot,
} from './lib/store';
import { getToken, getWhoAmI } from './lib/github';
import { DRAFT_EVENT, totalUnsaved } from './lib/draft';
import { loadAdded, saveAdded, type AddedMovie } from './lib/added';
import { loadMarks, saveMarks, type Marks } from './lib/marks';
import { saveOverride, clearOverride } from './lib/store';
import { TurnPanel } from './components/TurnPanel';
import { WatchForm } from './components/WatchForm';
import { BulkEntry } from './components/BulkEntry';
import { History } from './components/History';
import { RecentPicks } from './components/RecentPicks';
import { Browse, type OverridePatch } from './components/Browse';
import { AdjustmentPanel } from './components/AdjustmentPanel';
import { Settings } from './components/Settings';
import { Ballot } from './components/Ballot';
import { saveBallot, type Ballot as BallotData } from './lib/ballot';

type Tab = 'tracker' | 'browse' | 'backfill' | 'history' | 'ballot' | 'settings';

const BALLOT_YEARS = [2026, 2025, 2024];

const CURRENT_FILM_YEAR = (() => {
  // Before the ceremony, the season still in progress is last year's.
  const now = new Date();
  return now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
})();

export default function App() {
  const [tab, setTab] = useState<Tab>('tracker');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState(0);
  const [unsaved, setUnsaved] = useState(() => totalUnsaved());
  const [added, setAdded] = useState<AddedMovie[]>([]);
  const [marks, setMarks] = useState<Marks>({});
  const [ballotYear, setBallotYear] = useState(CURRENT_FILM_YEAR);

  const canEdit = Boolean(getToken());
  const whoami = getWhoAmI();

  const refresh = useCallback(async () => {
    try {
      const [snapshot, addedMovies, movieMarks] = await Promise.all([
        loadSnapshot(),
        loadAdded(),
        loadMarks(),
      ]);
      setAdded(addedMovies);
      setMarks(movieMarks);
      setSnap(snapshot);
      setError(null);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // "Failed to fetch" tells nobody anything; say what to do about it.
      setError(
        /failed to fetch|networkerror|load failed/i.test(raw)
          ? "Could not reach GitHub. You are seeing an empty page rather than your data — check your connection and reload."
          : raw
      );
      // Fall back to an empty dataset rather than a blank page: offline or
      // rate-limited, the shell should still render so Settings is reachable.
      setSnap((prev) => prev ?? { config: DEFAULT_CONFIG, watches: [], adjustments: [], overrides: [] });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, identity]);

  // Unsaved history edits are worth surfacing from every tab, not just the one
  // they were made on — and they reserve room for the save bar.
  useEffect(() => {
    const onDraft = (e: Event) => setUnsaved((e as CustomEvent<number>).detail);
    window.addEventListener(DRAFT_EVENT, onDraft);
    return () => window.removeEventListener(DRAFT_EVENT, onDraft);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('has-unsaved', unsaved > 0);
  }, [unsaved]);

  const config: Config = snap?.config ?? DEFAULT_CONFIG;

  const turnState = useMemo(
    () => computeTurnState(snap?.watches ?? [], snap?.adjustments ?? [], config),
    [snap, config]
  );

  /** Every mutation goes through here: optimistic local update, then a merged write. */
  async function mutate(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const addWatch = (w: Watch) =>
    mutate(async () => {
      await saveWatches([w], [], `Log watch: ${w.title}`);
    });

  const addWatches = (ws: Watch[]) =>
    mutate(async () => {
      await saveWatches(ws, [], `Backfill ${ws.length} watch${ws.length === 1 ? '' : 'es'}`);
    });

  const updateWatch = (w: Watch) =>
    mutate(async () => {
      await saveWatches([w], [], `Correct pick: ${w.title}`);
    });

  const addMovie = (m: AddedMovie) =>
    mutate(async () => {
      await saveAdded(m);
    });

  const saveWatchSet = (add: Watch[], removeIds: string[]) =>
    mutate(async () => {
      await saveWatches(add, removeIds, `Mark ${add.length + removeIds.length} as watched`);
    });

  const updateMarks = (changes: Marks) =>
    mutate(async () => {
      const n = Object.keys(changes).length;
      await saveMarks(changes, `Update ${n} movie${n === 1 ? '' : 's'}`);
    });

  const storeBallot = (b: BallotData) =>
    mutate(async () => {
      await saveBallot(b);
    });

  const setYearOverride = (movieId: string, patch: OverridePatch | null) =>
    mutate(async () => {
      if (patch === null) {
        await clearOverride(movieId, `Clear corrections: ${movieId}`);
        return;
      }
      const what = [
        patch.eligibilityYear ? `year ${patch.eligibilityYear}` : null,
        patch.tmdbId ? `TMDB ${patch.tmdbId}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      await saveOverride(
        {
          movieId,
          eligibilityYear: patch.eligibilityYear,
          tmdbId: patch.tmdbId,
          note: patch.note.trim() || undefined,
          at: new Date().toISOString(),
          by: whoami ?? 'me',
        },
        `Correct ${what || 'entry'}: ${movieId}`
      );
    });

  const deleteWatch = (w: Watch) => {
    if (!confirm(`Remove "${w.title}" from ${w.date}?`)) return;
    mutate(async () => {
      await saveWatches([], [w.id], `Remove watch: ${w.title}`);
    });
  };

  const addAdjustment = (a: Adjustment) =>
    mutate(async () => {
      await saveAdjustments([a], [], `Adjust picks: ${a.type} ${a.count} for ${config.people[a.who]}`);
    });

  const deleteAdjustment = (a: Adjustment) => {
    if (!confirm('Remove this adjustment?')) return;
    mutate(async () => {
      await saveAdjustments([], [a.id], 'Remove adjustment');
    });
  };

  const updateConfig = (c: Config) =>
    mutate(async () => {
      await saveConfig(c, 'Update rotation settings');
    });

  if (!snap && !error) {
    return (
      <div className="wrap">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Movie Nights</h1>
        <span className="small muted">
          {unsaved > 0 && (
            <>
              <strong className="unsaved-marker">{unsaved} unsaved</strong> ·{' '}
            </>
          )}
          {whoami ? config.people[whoami] : 'Not identified'} ·{' '}
          {canEdit ? 'can save' : 'read-only'}
        </span>
      </header>

      <nav className="tabs">
        {(
          [
            ['tracker', 'Tracker'],
            ['browse', 'Browse'],
            ['backfill', 'Backfill'],
            ['history', 'History'],
            ['ballot', 'Ballot'],
            ['settings', 'Settings'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {error && <div className="banner error">{error}</div>}
      {!canEdit && tab !== 'settings' && (
        <div className="banner warn">
          Read-only. Add a GitHub token under Settings to log watches.
        </div>
      )}

      {tab === 'tracker' && snap && (
        <>
          <TurnPanel state={turnState} config={config} />
          {canEdit && <WatchForm config={config} onAdd={addWatch} busy={busy} />}
          <RecentPicks
            watches={snap.watches}
            config={config}
            turnState={turnState}
            onUpdate={updateWatch}
            onDelete={deleteWatch}
            canEdit={canEdit}
            busy={busy}
          />
          <AdjustmentPanel
            config={config}
            adjustments={snap.adjustments}
            onAdd={addAdjustment}
            onDelete={deleteAdjustment}
            canEdit={canEdit}
            busy={busy}
          />
        </>
      )}

      {tab === 'browse' && snap && (
        <Browse
          config={config}
          overrides={snap.overrides}
          marks={marks}
          watches={snap.watches}
          onSaveMarks={updateMarks}
          onSaveWatches={saveWatchSet}
          onOverride={setYearOverride}
          canEdit={canEdit}
          busy={busy}
        />
      )}

      {tab === 'backfill' && snap && (
        canEdit ? (
          <BulkEntry config={config} onSave={addWatches} busy={busy} />
        ) : (
          <div className="panel">
            <div className="empty">Add a GitHub token under Settings to enter history.</div>
          </div>
        )
      )}

      {tab === 'history' && snap && (
        <History
          watches={snap.watches}
          added={added}
          config={config}
          onSaveMany={addWatches}
          onDelete={deleteWatch}
          onAddMovie={addMovie}
          canEdit={canEdit}
          busy={busy}
        />
      )}

      {tab === 'ballot' && snap && (
        <Ballot
          year={ballotYear}
          years={BALLOT_YEARS}
          onYearChange={setBallotYear}
          whoami={whoami}
          config={config}
          watches={snap.watches}
          overrides={snap.overrides}
          canEdit={canEdit}
          busy={busy}
          onSave={storeBallot}
          onMutate={mutate}
        />
      )}

      {tab === 'settings' && (
        <Settings
          config={config}
          onSaveConfig={updateConfig}
          onIdentityChange={() => setIdentity((n) => n + 1)}
          busy={busy}
        />
      )}
    </div>
  );
}
