import { useEffect, useMemo, useState } from 'react';
import type { CatalogMovie, Config, EligibilityOverride } from '../lib/types';
import { loadCatalog } from '../lib/store';
import { applyMark, type Mark, type Marks } from '../lib/marks';
import { BROWSE_DRAFT, clearDraft, draftSize, loadDraft, saveDraft } from '../lib/draft';

type Shown = 'released' | 'upcoming' | 'all';
type Filter = 'all' | 'unseen' | 'seen' | 'rated' | 'review';

const today = () => new Date().toISOString().slice(0, 10);

/** The date we could first have watched it, or null if no source knows one. */
export function releaseDate(m: CatalogMovie): string | null {
  return (
    [m.usLimitedDate, m.usTheatricalDate, m.homeDate].filter(Boolean).sort()[0] ?? null
  );
}

/**
 * Everything released in a year, as a list to work through.
 *
 * Defaults to what has actually come out, because the sources publish a full
 * year ahead and a list of films nobody could have seen yet is noise.
 */
export function Browse({
  config,
  overrides,
  marks,
  onSaveMarks,
  onOverride,
  canEdit,
  busy,
}: {
  config: Config;
  overrides: EligibilityOverride[];
  marks: Marks;
  onSaveMarks: (changes: Marks) => Promise<void>;
  onOverride: (movieId: string, year: number | null, note: string) => Promise<void>;
  canEdit: boolean;
  busy: boolean;
}) {
  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null);
  const [shown, setShown] = useState<Shown>('released');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [staged, setStaged] = useState<Record<string, Partial<Mark>>>(() => loadDraft(BROWSE_DRAFT));

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setCatalog(null);
    setLoadError(null);
    loadCatalog(year)
      .then((c) => current && setCatalog(c))
      .catch((e) => {
        // Without this the page sits on "Loading" for ever, which is what a
        // catalog too big for the contents API used to do.
        if (!current) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setCatalog([]);
      });
    return () => {
      current = false;
    };
  }, [year, attempt]);

  useEffect(() => {
    saveDraft(BROWSE_DRAFT, staged);
  }, [staged]);

  const overrideFor = useMemo(
    () => new Map(overrides.map((o) => [o.movieId, o])),
    [overrides]
  );

  const rows = useMemo(() => {
    if (!catalog) return [];
    const now = today();
    return catalog
      .map((m) => {
        const merged = applyMark(m, marks);
        const stage = staged[m.id];
        return {
          ...merged,
          seen: stage?.seen ?? merged.seen,
          wantToSee: stage?.wantToSee !== undefined ? stage.wantToSee : merged.wantToSee,
          dirty: Boolean(stage),
          released: releaseDate(m),
        };
      })
      .filter((m) => {
        if (shown === 'released') return m.released !== null && m.released <= now;
        if (shown === 'upcoming') return m.released !== null && m.released > now;
        return true;
      })
      .sort((a, b) => {
        if (a.released && b.released && a.released !== b.released) {
          return a.released < b.released ? 1 : -1;
        }
        if (a.released !== b.released) return a.released ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [catalog, marks, staged, shown]);

  const visible = rows.filter((m) => {
    if (query && !m.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'unseen') return !m.seen;
    if (filter === 'seen') return m.seen;
    if (filter === 'rated') return m.wantToSee != null;
    if (filter === 'review') return m.confidence === 'low' || Boolean(overrideFor.get(m.id));
    return true;
  });

  const stage = (id: string, patch: Partial<Mark>) =>
    setStaged((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  async function save() {
    const now = new Date().toISOString();
    const changes: Marks = {};
    for (const [id, patch] of Object.entries(staged)) {
      changes[id] = { ...patch, at: now, by: config.people.me };
    }
    await onSaveMarks(changes);
    setStaged({});
    clearDraft(BROWSE_DRAFT);
  }

  const datedCount = catalog?.filter((m) => releaseDate(m)).length ?? 0;
  const years = Array.from({ length: thisYear - 2010 + 1 }, (_, i) => thisYear - i);
  const pending = draftSize(staged);

  return (
    <>
      <div className="panel">
        <h2>
          Browse
          <span className="sub">
            {catalog === null
              ? 'loading…'
              : `${visible.length} of ${catalog.length} in ${year}`}
          </span>
        </h2>

        <div className="row spread">
          <div className="row">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 96 }}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {(
              [
                ['released', 'Out now'],
                ['upcoming', 'Coming'],
                ['all', 'All'],
              ] as [Shown, string][]
            ).map(([id, label]) => (
              <button key={id} className={shown === id ? 'primary' : 'ghost'} onClick={() => setShown(id)}>
                {label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a title…"
            style={{ maxWidth: 200 }}
          />
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          {(
            [
              ['all', 'Everything'],
              ['unseen', 'Not seen'],
              ['seen', 'Seen'],
              ['rated', 'Rated'],
              ['review', 'Needs a year check'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} className={filter === id ? 'primary' : 'ghost'} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="banner error" style={{ marginTop: 12, marginBottom: 0 }}>
            {loadError}{' '}
            <button className="ghost" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        )}

        {catalog !== null && !loadError && datedCount === 0 && (
          <div className="banner warn" style={{ marginTop: 12, marginBottom: 0 }}>
            No release dates for {year} yet, so nothing can be filtered by what is out.
            Run <strong>Refresh catalog</strong> for this year, then reload. Showing
            everything in the meantime.
          </div>
        )}
      </div>

      {pending > 0 && (
        <div className="save-bar">
          <span className="small">
            {pending} {pending === 1 ? 'change' : 'changes'} not saved
          </span>
          <div className="row">
            <button
              className="ghost"
              disabled={busy}
              onClick={() => {
                if (confirm(`Discard ${pending} unsaved ${pending === 1 ? 'change' : 'changes'}?`)) {
                  setStaged({});
                  clearDraft(BROWSE_DRAFT);
                }
              }}
            >
              Discard
            </button>
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : `Save ${pending}`}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        {catalog === null ? (
          <div className="empty">Loading {year}…</div>
        ) : visible.length === 0 ? (
          <div className="empty">
            {shown === 'released' && datedCount > 0
              ? `Nothing from ${year} has come out yet.`
              : 'Nothing matches.'}
          </div>
        ) : (
          <ul className="browse">
            {visible.map((m) => {
              const isOpen = expanded === m.id;
              const override = overrideFor.get(m.id);
              return (
                <li key={m.id} className={m.dirty ? 'dirty' : ''}>
                  <div className="b-row">
                    <button
                      className="ghost b-title"
                      onClick={() => setExpanded(isOpen ? null : m.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="b-date">{m.released ?? '—'}</span>
                      <span className="b-name">{m.title}</span>
                      {m.services?.length ? <span className="badge free">{m.services[0]}</span> : null}
                      {m.confidence === 'low' && !override && (
                        <span className="badge traded">year?</span>
                      )}
                      {override && <span className="badge me">{override.eligibilityYear ?? 'excluded'}</span>}
                    </button>

                    <div className="b-actions">
                      <select
                        className="rate"
                        value={m.wantToSee ?? ''}
                        disabled={!canEdit}
                        onChange={(e) =>
                          stage(m.id, { wantToSee: e.target.value ? Number(e.target.value) : null })
                        }
                        aria-label={`How much we want to see ${m.title}`}
                      >
                        <option value="">–</option>
                        {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <button
                        className={`chip-toggle ${m.seen ? 'on' : ''}`}
                        disabled={!canEdit}
                        onClick={() => stage(m.id, { seen: !m.seen })}
                        aria-pressed={m.seen}
                      >
                        {m.seen ? 'Seen' : 'Not seen'}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <Details movie={m} override={override} onOverride={onOverride} canEdit={canEdit} busy={busy} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Details({
  movie,
  override,
  onOverride,
  canEdit,
  busy,
}: {
  movie: CatalogMovie;
  override?: EligibilityOverride;
  onOverride: (movieId: string, year: number | null, note: string) => Promise<void>;
  canEdit: boolean;
  busy: boolean;
}) {
  const [year, setYear] = useState(String(override?.eligibilityYear ?? movie.computedYear ?? ''));
  const [note, setNote] = useState(override?.note ?? '');
  const r = movie.ratings ?? {};
  const scores = [
    ['IMDb', r.imdb],
    ['Metacritic', r.metacritic],
    ['RT critics', r.rtCritic],
    ['RT audience', r.rtAudience],
  ].filter(([, v]) => v != null);

  return (
    <div className="b-details">
      <div className="b-meta small muted">
        {movie.kind && <span>{movie.kind}</span>}
        {movie.isDocumentary && <span>documentary</span>}
        {movie.isForeignLanguage && <span>foreign language</span>}
        {movie.services?.length ? <span>{movie.services.join(', ')}</span> : null}
      </div>

      {scores.length > 0 && (
        <div className="row small" style={{ gap: 12 }}>
          {scores.map(([label, v]) => (
            <span key={String(label)}>
              <span className="muted">{label} </span>
              <strong>{String(v)}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="b-dates small muted">
        {movie.usLimitedDate && <span>limited {movie.usLimitedDate}</span>}
        {movie.usTheatricalDate && <span>wide {movie.usTheatricalDate}</span>}
        {movie.homeDate && <span>home {movie.homeDate}</span>}
        {movie.festivalDate && <span>festival {movie.festivalDate}</span>}
      </div>

      {movie.evidence?.length ? <div className="note">{movie.evidence.join(' ')}</div> : null}

      {canEdit && (
        <div className="row b-override">
          <span className="small muted">Ballot year</span>
          <input
            type="number"
            value={year}
            min={1900}
            max={2100}
            onChange={(e) => setYear(e.target.value)}
            style={{ width: 88 }}
            aria-label={`Ballot year for ${movie.title}`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="why (optional)"
            style={{ flex: 1, minWidth: 120 }}
          />
          <button
            className="primary"
            disabled={busy}
            onClick={() => onOverride(movie.id, year ? Number(year) : null, note)}
          >
            Set
          </button>
          {override && (
            <button className="ghost" disabled={busy} onClick={() => onOverride(movie.id, null, '')}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
