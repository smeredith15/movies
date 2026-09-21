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
import { TurnPanel } from './components/TurnPanel';
import { WatchForm } from './components/WatchForm';
import { WatchList } from './components/WatchList';
import { AdjustmentPanel } from './components/AdjustmentPanel';
import { Settings } from './components/Settings';
import { Ballot } from './components/Ballot';

type Tab = 'tracker' | 'history' | 'ballot' | 'settings';

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

  const canEdit = Boolean(getToken());
  const whoami = getWhoAmI();

  const refresh = useCallback(async () => {
    try {
      setSnap(await loadSnapshot());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, identity]);

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
          {whoami ? config.people[whoami] : 'Not identified'} ·{' '}
          {canEdit ? 'can save' : 'read-only'}
        </span>
      </header>

      <nav className="tabs">
        {(
          [
            ['tracker', 'Tracker'],
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

      {tab === 'history' && snap && (
        <WatchList
          watches={snap.watches}
          config={config}
          turnState={turnState}
          onDelete={deleteWatch}
          canEdit={canEdit}
        />
      )}

      {tab === 'ballot' && <Ballot year={CURRENT_FILM_YEAR} />}

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
