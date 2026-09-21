import { useEffect, useMemo, useState } from 'react';
import type { AddedMovie } from '../lib/added';
import type { Config, Picker, StagedWatch, Venue, Watch } from '../lib/types';
import { newId } from '../lib/store';
import { loadSeen, type SeenMovie } from '../lib/seen';
import { HISTORY_DRAFT, clearDraft, loadDraft, saveDraft } from '../lib/draft';
import { AddMovie } from './AddMovie';
import { ballotStatus, defaultBallotChoice } from '../../shared/eligibility.js';

type Staged = StagedWatch;
type Filter = 'all' | 'undated' | 'dated';

const STAGED_DEFAULTS: Staged = { date: '', picker: 'me', venue: 'home' };

interface Row {
  key: string;
  title: string;
  movieId: string | null;
  watch: Watch | null;
  year: number;
  added?: boolean;
}

const isDated = (row: Row) => Boolean(row.watch?.date);

/**
 * The watched history, per release year.
 *
 * Two sources feed this. The workbook import knows *what* we watched in each
 * year but never *when* or *who picked it* — it had no such columns — so those
 * arrive as rows to fill in. Anything logged through the app has the full
 * record. A row can be saved as soon as any field is set: a pick whose date we
 * cannot remember is still worth recording, it just sits out of the rotation
 * until a date arrives.
 */
export function History({
  watches,
  added,
  config,
  onSaveMany,
  onDelete,
  onAddMovie,
  canEdit,
  busy,
}: {
  watches: Watch[];
  added: AddedMovie[];
  config: Config;
  onSaveMany: (ws: Watch[]) => Promise<void>;
  onDelete: (w: Watch) => void;
  onAddMovie: (m: AddedMovie) => Promise<void>;
  canEdit: boolean;
  busy: boolean;
}) {
  const [seen, setSeen] = useState<SeenMovie[] | null>(null);
  const [staged, setStaged] = useState<Record<string, Staged>>(() => loadDraft<Staged>(HISTORY_DRAFT));
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const narrow = (next: { filter?: Filter; query?: string }) => {
    if (next.filter !== undefined) setFilter(next.filter);
    if (next.query !== undefined) setQuery(next.query);
    setOpen({});
  };

  useEffect(() => {
    loadSeen().then(setSeen);
  }, []);

  // Persist on every keystroke so nothing is lost to a tab switch, a reload,
  // or the back button.
  useEffect(() => {
    saveDraft(HISTORY_DRAFT, staged);
  }, [staged]);

  // And catch the case localStorage cannot: closing the tab outright.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(staged).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [staged]);

  const watchByMovie = useMemo(() => {
    const map = new Map<string, Watch>();
    for (const w of watches) if (w.movieId) map.set(w.movieId, w);
    return map;
  }, [watches]);

  /** Release-year sections, plus one for watches that matched no catalog entry. */
  const { years, unmatched, rowByKey, knownIds } = useMemo(() => {
    const byYear = new Map<number, Row[]>();
    const rowByKey = new Map<string, Row>();
    const knownIds = new Set<string>();

    const push = (year: number, row: Row) => {
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(row);
      rowByKey.set(row.key, row);
    };

    for (const m of seen ?? []) {
      knownIds.add(m.id);
      push(m.year, { key: m.id, title: m.title, movieId: m.id, watch: watchByMovie.get(m.id) ?? null, year: m.year });
    }

    for (const m of added) {
      if (knownIds.has(m.id)) continue;
      knownIds.add(m.id);
      push(m.year, {
        key: m.id,
        title: m.title,
        movieId: m.id,
        watch: watchByMovie.get(m.id) ?? null,
        year: m.year,
        added: true,
      });
    }

    // A watch logged against a catalog movie the workbook never marked seen
    // still belongs in that movie's year.
    for (const w of watches) {
      if (!w.movieId || knownIds.has(w.movieId)) continue;
      knownIds.add(w.movieId);
      const year = Number(w.movieId.slice(-4)) || Number(w.date.slice(0, 4)) || 0;
      push(year, { key: w.movieId, title: w.title, movieId: w.movieId, watch: w, year });
    }

    const unmatched: Row[] = watches
      .filter((w) => !w.movieId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((w) => ({ key: w.id, title: w.title, movieId: null, watch: w, year: Number(w.date.slice(0, 4)) || 0 }));
    for (const r of unmatched) rowByKey.set(r.key, r);

    return {
      years: [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, rows]) => ({ year, rows: rows.sort((a, b) => a.title.localeCompare(b.title)) })),
      unmatched,
      rowByKey,
      knownIds,
    };
  }, [seen, added, watches, watchByMovie]);

  const matches = (row: Row) => {
    if (query && !row.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'undated') return !isDated(row);
    if (filter === 'dated') return isDated(row);
    return true;
  };

  const stage = (key: string, patch: Partial<Staged>) =>
    setStaged((s) => {
      const row = rowByKey.get(key);
      const base: Staged = row?.watch
        ? {
            date: row.watch.date,
            picker: row.watch.picker,
            venue: row.watch.venue,
            onBallot: row.watch.onBallot,
          }
        : STAGED_DEFAULTS;
      return { ...s, [key]: { ...base, ...s[key], ...patch } };
    });

  // Anything touched is saveable. A date is no longer the price of admission —
  // that requirement is what made the Save button seem to be missing.
  const ready = Object.entries(staged).filter(([key]) => rowByKey.has(key));

  async function save() {
    await onSaveMany(
      ready.map(([key, v]) => {
        const row = rowByKey.get(key)!;
        return {
          id: row.watch?.id ?? newId('w'),
          date: v.date,
          title: row.title,
          movieId: row.movieId,
          venue: v.venue,
          picker: v.picker,
          consumesTurn: v.picker !== 'joint',
          ...(v.onBallot === undefined ? {} : { onBallot: v.onBallot }),
          note: row.watch?.note,
        };
      })
    );
    setStaged({});
    clearDraft(HISTORY_DRAFT);
  }

  if (seen === null) {
    return (
      <div className="panel">
        <div className="empty">Loading history…</div>
      </div>
    );
  }

  const allRows = [...years.flatMap((y) => y.rows), ...unmatched];
  const totalDated = allRows.filter(isDated).length;
  const undatedWatches = allRows.filter((r) => r.watch && !r.watch.date).length;

  return (
    <>
      <div className="panel">
        <h2>
          History
          <span className="sub">
            {allRows.length} watched · {totalDated} dated
            {undatedWatches > 0 && ` · ${undatedWatches} saved without a date`}
          </span>
        </h2>

        <div className="row spread">
          <div className="row">
            {(
              [
                ['all', 'All'],
                ['undated', 'Needs a date'],
                ['dated', 'Dated'],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button key={id} className={filter === id ? 'primary' : 'ghost'} onClick={() => narrow({ filter: id })}>
                {label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => narrow({ query: e.target.value })}
            placeholder="Find a title…"
            style={{ maxWidth: 220 }}
          />
        </div>

        {canEdit && (
          <div className="row" style={{ marginTop: 10 }}>
            <AddMovie existingIds={knownIds} onAdd={onAddMovie} busy={busy} />
          </div>
        )}

        <p className="small muted" style={{ marginBottom: 0 }}>
          The imported workbook recorded what we watched each year but not when
          or who picked it. Set whatever you know — a pick saved without a date
          still counts as watched, it just sits out of the rotation until dated.
        </p>
      </div>

      {ready.length > 0 && (
        <div className="save-bar">
          <span className="small">
            {ready.length} {ready.length === 1 ? 'entry' : 'entries'} ready to save
          </span>
          <div className="row">
            <button
              className="ghost"
              onClick={() => {
                if (confirm(`Discard ${ready.length} unsaved ${ready.length === 1 ? 'change' : 'changes'}?`)) {
                  setStaged({});
                  clearDraft(HISTORY_DRAFT);
                }
              }}
              disabled={busy}
            >
              Discard
            </button>
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : `Save ${ready.length}`}
            </button>
          </div>
        </div>
      )}

      {unmatched.length > 0 && (
        <Section
          title="Not in the catalog"
          meta={`${unmatched.length} logged by hand`}
          rows={unmatched.filter(matches)}
          {...{ config, staged, stage, onDelete, canEdit }}
        />
      )}

      {years.map(({ year, rows }, i) => {
        const shown = rows.filter(matches);
        if (!shown.length) return null;
        // Searching or filtering means you are looking for something specific,
        // so matching sections open themselves — otherwise a hit inside a
        // collapsed year looks like no hit at all.
        const narrowed = query.trim() !== '' || filter !== 'all';
        const expanded = open[year] ?? (narrowed || i === 0);
        return (
          <Section
            key={year}
            title={
              <button className="ghost year-toggle" onClick={() => setOpen((o) => ({ ...o, [year]: !expanded }))}>
                {expanded ? '▾' : '▸'} {year || 'Unknown year'}
              </button>
            }
            meta={`${rows.length} watched · ${rows.filter(isDated).length} dated${
              config.frozenYears?.includes(year) ? ' · ballot frozen' : ''
            }`}
            rows={expanded ? shown : []}
            {...{ config, staged, stage, onDelete, canEdit }}
          />
        );
      })}
    </>
  );
}

function Section({
  title,
  meta,
  rows,
  config,
  staged,
  stage,
  onDelete,
  canEdit,
}: {
  title: React.ReactNode;
  meta: string;
  rows: Row[];
  config: Config;
  staged: Record<string, Staged>;
  stage: (key: string, patch: Partial<Staged>) => void;
  onDelete: (w: Watch) => void;
  canEdit: boolean;
}) {
  return (
    <div>
      <div className="season-head">
        <h3>{title}</h3>
        <span className="range">{meta}</span>
      </div>
      {rows.length > 0 && (
        <div className="panel">
          <ul className="watches">
            {rows.map((row) => (
              <HistoryRow
                key={row.key}
                row={row}
                config={config}
                staged={staged[row.key]}
                stage={stage}
                onDelete={onDelete}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  row,
  config,
  staged,
  stage,
  onDelete,
  canEdit,
}: {
  row: Row;
  config: Config;
  staged?: Staged;
  stage: (key: string, patch: Partial<Staged>) => void;
  onDelete: (w: Watch) => void;
  canEdit: boolean;
}) {
  const w = row.watch;

  // A fully recorded watch reads back; anything else stays editable so the
  // missing pieces can be filled in later.
  if (w && w.date && !staged) {
    return (
      <li>
        <div className="w-date">{w.date}</div>
        <div className="w-main">
          <div className="w-title">{w.title}</div>
          <div className="w-meta row">
            <BallotBadge row={row} config={config} />
            <span className={`badge ${w.picker}`}>
              {w.picker === 'joint' ? 'Both of us' : config.people[w.picker]}
            </span>
            {w.venue === 'theater' && <span className="badge theater">Theater</span>}
            {!w.consumesTurn && <span className="badge free">No turn used</span>}
            {row.added && <span className="badge free">Added by hand</span>}
          </div>
          {w.note && <div className="note">{w.note}</div>}
        </div>
        {canEdit && (
          <div className="w-actions">
            <button className="ghost" onClick={() => stage(row.key, {})}>
              Edit
            </button>
            <button className="danger" onClick={() => onDelete(w)}>
              Delete
            </button>
          </div>
        )}
      </li>
    );
  }

  const value: Staged = staged ?? (w ? { date: w.date, picker: w.picker, venue: w.venue } : STAGED_DEFAULTS);

  return (
    <li className={`undated${staged ? ' editing' : ''}`}>
      <div className="w-main">
        <div className="w-title">{row.title}</div>
        <div className="w-meta row">
          {w && !w.date && <span className="badge traded">No date yet</span>}
          {row.added && <span className="badge free">Added by hand</span>}
          {!canEdit && !w && <span className="muted small">Not recorded</span>}
        </div>
      </div>
      {canEdit && (
        <div className="row date-entry">
          <BallotChoice row={row} value={value} stage={stage} />
          <input
            type="date"
            value={value.date}
            onChange={(e) => stage(row.key, { date: e.target.value })}
            aria-label={`Date watched for ${row.title}`}
          />
          <select
            value={value.picker}
            onChange={(e) => stage(row.key, { picker: e.target.value as Picker })}
            aria-label={`Who picked ${row.title}`}
          >
            <option value="me">{config.people.me}</option>
            <option value="her">{config.people.her}</option>
            <option value="joint">Both</option>
          </select>
          <select
            value={value.venue}
            onChange={(e) => {
              const venue = e.target.value as Venue;
              stage(row.key, venue === 'theater' ? { venue, picker: 'joint' } : { venue });
            }}
            aria-label={`Where we watched ${row.title}`}
          >
            <option value="home">Home</option>
            <option value="theater">Theater</option>
          </select>
        </div>
      )}
    </li>
  );
}

/**
 * Whether this viewing counts toward the year's ballot.
 *
 * Auto follows the date: on or before the ceremony that closes the film year
 * and it counts. Yes and No state it outright, for the many older viewings
 * where we know we saw something inside the window but not which day.
 */
function BallotChoice({
  row,
  value,
  stage,
}: {
  row: Row;
  value: Staged;
  stage: (key: string, patch: Partial<Staged>) => void;
}) {
  const derived = defaultBallotChoice(value.date, row.year, {});
  const current = value.onBallot === undefined ? 'auto' : value.onBallot ? 'yes' : 'no';
  const autoLabel =
    derived === null ? 'Auto' : derived ? 'Auto · yes' : 'Auto · no';

  const set = (choice: 'auto' | 'yes' | 'no') =>
    stage(row.key, { onBallot: choice === 'auto' ? undefined : choice === 'yes' });

  return (
    <div className="seg ballot-seg" role="group" aria-label={`Ballot for ${row.title}`}>
      <button
        className={current === 'auto' ? 'on' : ''}
        onClick={() => set('auto')}
        title={
          derived === null
            ? 'No date, so nothing to go on — choose Yes or No'
            : 'Decided by the date watched'
        }
      >
        {autoLabel}
      </button>
      <button className={current === 'yes' ? 'on' : ''} onClick={() => set('yes')} title="On the ballot">
        Yes
      </button>
      <button className={current === 'no' ? 'on' : ''} onClick={() => set('no')} title="Not on the ballot">
        No
      </button>
    </div>
  );
}

function BallotBadge({ row, config }: { row: Row; config: Config }) {
  if (!row.watch) return null;
  const status = ballotStatus(row.watch, row.year, config.oscarDates ?? {});

  if (status.source === 'unset') {
    return (
      <span className="badge traded" title="No date and no answer — say yes or no">
        ballot?
      </span>
    );
  }
  if (!status.onBallot) {
    return (
      <span className="badge free" title={`Watched after the ${row.year} ceremony on ${status.closes}`}>
        off ballot
      </span>
    );
  }
  return (
    <span className="badge joint" title={`Counts toward the ${row.year} ballot${status.source === 'manual' ? ', set by hand' : ''}`}>
      {row.year} ballot{status.source === 'manual' ? '*' : ''}
    </span>
  );
}
