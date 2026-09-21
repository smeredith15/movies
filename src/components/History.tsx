import { useEffect, useMemo, useState } from 'react';
import type { Config, Picker, Venue, Watch } from '../lib/types';
import { newId } from '../lib/store';
import { loadSeen, type SeenMovie } from '../lib/seen';

interface Staged {
  date: string;
  picker: Picker;
  venue: Venue;
}

type Filter = 'all' | 'undated' | 'dated';

const STAGED_DEFAULTS: Staged = { date: '', picker: 'me', venue: 'home' };

interface Row {
  key: string;
  title: string;
  movieId: string | null;
  watch: Watch | null;
}

/**
 * The watched history, per release year.
 *
 * Two sources feed this. The workbook import knows *what* we watched in each
 * year but never *when* or *who picked it* — it had no such columns — so those
 * arrive as rows waiting to be dated. Anything logged through the app has the
 * full record. Filling in a date here turns an imported row into a real watch.
 */
export function History({
  watches,
  config,
  onSaveMany,
  onDelete,
  canEdit,
  busy,
}: {
  watches: Watch[];
  config: Config;
  onSaveMany: (ws: Watch[]) => Promise<void>;
  onDelete: (w: Watch) => void;
  canEdit: boolean;
  busy: boolean;
}) {
  const [seen, setSeen] = useState<SeenMovie[] | null>(null);
  const [staged, setStaged] = useState<Record<string, Staged>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadSeen().then(setSeen);
  }, []);

  const watchByMovie = useMemo(() => {
    const map = new Map<string, Watch>();
    for (const w of watches) if (w.movieId) map.set(w.movieId, w);
    return map;
  }, [watches]);

  /** Release-year sections, plus one for watches that matched no catalog entry. */
  const { years, unmatched } = useMemo(() => {
    const byYear = new Map<number, Row[]>();

    for (const m of seen ?? []) {
      if (!byYear.has(m.year)) byYear.set(m.year, []);
      byYear.get(m.year)!.push({
        key: m.id,
        title: m.title,
        movieId: m.id,
        watch: watchByMovie.get(m.id) ?? null,
      });
    }

    // A watch logged against a catalog movie that the workbook never marked
    // seen still belongs in that movie's year.
    for (const w of watches) {
      if (!w.movieId) continue;
      const already = (seen ?? []).some((m) => m.id === w.movieId);
      if (already) continue;
      const year = Number(w.movieId.slice(-4)) || Number(w.date.slice(0, 4));
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push({ key: w.id, title: w.title, movieId: w.movieId, watch: w });
    }

    return {
      years: [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, rows]) => ({
          year,
          rows: rows.sort((a, b) => a.title.localeCompare(b.title)),
        })),
      unmatched: watches
        .filter((w) => !w.movieId)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((w) => ({ key: w.id, title: w.title, movieId: null, watch: w })),
    };
  }, [seen, watches, watchByMovie]);

  const matches = (row: Row) => {
    if (query && !row.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'undated') return !row.watch;
    if (filter === 'dated') return Boolean(row.watch);
    return true;
  };

  const stage = (key: string, patch: Partial<Staged>) =>
    setStaged((s) => ({ ...s, [key]: { ...STAGED_DEFAULTS, ...s[key], ...patch } }));

  const ready = Object.entries(staged).filter(([, v]) => v.date);

  async function save() {
    const titleOf = new Map((seen ?? []).map((m) => [m.id, m.title]));
    await onSaveMany(
      ready.map(([movieId, v]) => ({
        id: newId('w'),
        date: v.date,
        title: titleOf.get(movieId) ?? movieId,
        movieId,
        venue: v.venue,
        picker: v.picker,
        consumesTurn: v.picker !== 'joint',
      }))
    );
    setStaged({});
  }

  if (seen === null) {
    return (
      <div className="panel">
        <div className="empty">Loading history…</div>
      </div>
    );
  }

  const totalSeen = seen.length;
  const totalDated = seen.filter((m) => watchByMovie.has(m.id)).length;

  return (
    <>
      <div className="panel">
        <h2>
          History
          <span className="sub">
            {totalSeen} watched · {totalDated} dated · {totalSeen - totalDated} still need a date
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
              <button key={id} className={filter === id ? 'primary' : 'ghost'} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a title…"
            style={{ maxWidth: 220 }}
          />
        </div>

        <p className="small muted" style={{ marginBottom: 0 }}>
          The imported workbook recorded what we watched each year but not when
          or who picked it. Set a date here and the entry becomes a real watch
          that counts toward the rotation.
        </p>
      </div>

      {ready.length > 0 && (
        <div className="save-bar">
          <span className="small">
            {ready.length} {ready.length === 1 ? 'entry' : 'entries'} ready to save
          </span>
          <div className="row">
            <button className="ghost" onClick={() => setStaged({})} disabled={busy}>
              Discard
            </button>
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : `Save ${ready.length}`}
            </button>
          </div>
        </div>
      )}

      {unmatched.length > 0 && filter !== 'undated' && (
        <div>
          <div className="season-head">
            <h3>Not in the catalog</h3>
            <span className="range">{unmatched.length} logged by hand</span>
          </div>
          <div className="panel">
            <ul className="watches">
              {unmatched.filter(matches).map((row) => (
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
        </div>
      )}

      {years.map(({ year, rows }, i) => {
        const shown = rows.filter(matches);
        if (!shown.length) return null;
        const dated = rows.filter((r) => r.watch).length;
        const expanded = open[year] ?? i === 0;

        return (
          <div key={year}>
            <div className="season-head">
              <h3>
                <button className="ghost year-toggle" onClick={() => setOpen((o) => ({ ...o, [year]: !expanded }))}>
                  {expanded ? '▾' : '▸'} {year}
                </button>
              </h3>
              <span className="range">
                {rows.length} watched · {dated} dated
                {config.frozenYears?.includes(year) && ' · ballot frozen'}
              </span>
            </div>
            {expanded && (
              <div className="panel">
                <ul className="watches">
                  {shown.map((row) => (
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
      })}
    </>
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

  if (w) {
    return (
      <li>
        <div className="w-date">{w.date}</div>
        <div className="w-main">
          <div className="w-title">{w.title}</div>
          <div className="w-meta row">
            <span className={`badge ${w.picker}`}>
              {w.picker === 'joint' ? 'Both of us' : config.people[w.picker]}
            </span>
            {w.venue === 'theater' && <span className="badge theater">Theater</span>}
            {!w.consumesTurn && <span className="badge free">No turn used</span>}
          </div>
          {w.note && <div className="note">{w.note}</div>}
        </div>
        {canEdit && (
          <div className="w-actions">
            <button className="danger" onClick={() => onDelete(w)}>
              Delete
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="undated">
      <div className="w-main">
        <div className="w-title">{row.title}</div>
        {!canEdit && <div className="w-meta muted small">No date yet</div>}
      </div>
      {canEdit && (
        <div className="row date-entry">
          <input
            type="date"
            value={staged?.date ?? ''}
            onChange={(e) => stage(row.key, { date: e.target.value })}
            aria-label={`Date watched for ${row.title}`}
          />
          <select
            value={staged?.picker ?? 'me'}
            onChange={(e) => stage(row.key, { picker: e.target.value as Picker })}
            aria-label={`Who picked ${row.title}`}
          >
            <option value="me">{config.people.me}</option>
            <option value="her">{config.people.her}</option>
            <option value="joint">Both</option>
          </select>
          <select
            value={staged?.venue ?? 'home'}
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
