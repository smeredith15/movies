import { useEffect, useRef, useState } from 'react';
import type { AddedMovie } from '../lib/added';
import { slugifyTitle } from '../lib/added';
import { indexCoverage, loadTmdbIndex, searchTmdb, type TmdbHit, type TmdbRow } from '../lib/tmdbIndex';

const THIS_YEAR = new Date().getUTCFullYear();

/**
 * Adds a movie the workbook never listed.
 *
 * Search runs against a TMDB index built by the Action and committed to the
 * repo — the page cannot query TMDB directly, because the API key is a
 * repository secret and anything a static page can read is public. Typing a
 * title by hand stays available for anything the index does not cover.
 */
export function AddMovie({
  existingIds,
  onAdd,
  busy,
}: {
  existingIds: Set<string>;
  onAdd: (movie: AddedMovie) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [rows, setRows] = useState<TmdbRow[] | null>(null);
  const [hits, setHits] = useState<TmdbHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  // One fetch per attempt. Without this, storing an empty result re-triggers
  // the effect, which fetches again — an unbounded loop.
  const [attempt, setAttempt] = useState(0);
  const attempted = useRef(-1);

  // The index is only worth downloading once someone actually opens this.
  // An empty result is not treated as final — opening again, or pressing
  // Retry, starts a new attempt, so a freshly built index is picked up.
  useEffect(() => {
    if (!open) return;
    if (rows && rows.length > 0) return;
    if (attempted.current === attempt) return;
    attempted.current = attempt;
    loadTmdbIndex().then(setRows);
  }, [open, attempt, rows]);

  useEffect(() => {
    if (!rows) return;
    setHits(searchTmdb(rows, query));
  }, [rows, query]);

  async function add(movie: { title: string; year: number; tmdbId?: number }) {
    const id = slugifyTitle(movie.title, movie.year);
    if (existingIds.has(id)) {
      setError(`${movie.title} (${movie.year}) is already in the list.`);
      return;
    }
    setError(null);
    await onAdd({ id, ...movie, addedAt: new Date().toISOString() });
    setQuery('');
    setYear('');
    setManual(false);
    setOpen(false);
  }

  function addTyped(e: React.FormEvent) {
    e.preventDefault();
    const title = query.trim();
    const y = Number(year);
    if (!title) return;
    if (!Number.isInteger(y) || y < 1880 || y > THIS_YEAR + 5) {
      setError(`${year || 'A blank year'} is not a release year we can use.`);
      return;
    }
    add({ title, year: y });
  }

  if (!open) {
    return (
      <button
        className="ghost"
        onClick={() => {
          setOpen(true);
          setAttempt((a) => a + 1);
        }}
      >
        + Add a movie
      </button>
    );
  }

  const indexEmpty = rows !== null && rows.length === 0;
  const searching = query.trim().length >= 2;
  const coverage = indexCoverage(rows ?? []);

  return (
    <div className="add-movie">
      <div className="row" style={{ width: '100%' }}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder={rows === null ? 'Loading titles…' : 'Search for a movie'}
          autoFocus
          style={{ flex: 1, minWidth: 180 }}
        />
        <button
          className="ghost"
          onClick={() => {
            setOpen(false);
            setManual(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>

      {indexEmpty && (
        <div className="row small muted" style={{ width: '100%' }}>
          <span>
            No search index yet. Run the <strong>Build movie search index</strong>{' '}
            action, or add a movie by hand below.
          </span>
          <button
            className="ghost"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Retry
          </button>
          <button className="ghost" onClick={() => setManual(true)}>
            Add by hand
          </button>
        </div>
      )}

      {searching && hits.length > 0 && (
        <ul className="tmdb-results">
          {hits.map((h) => {
            const already = existingIds.has(slugifyTitle(h.title, h.year));
            return (
              <li key={h.tmdbId}>
                <span className="combo-title">{h.title}</span>
                <span className="combo-meta">{h.year}</span>
                <button
                  className={already ? 'ghost' : 'primary'}
                  disabled={busy || already}
                  onClick={() => add({ title: h.title, year: h.year, tmdbId: h.tmdbId })}
                >
                  {already ? 'Already listed' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {searching && rows !== null && rows.length > 0 && hits.length === 0 && !manual && (
        <div className="row small muted" style={{ width: '100%' }}>
          <span>
            No match for “{query.trim()}” in the {coverage.count.toLocaleString()} titles
            indexed{coverage.from ? ` from ${coverage.from} on` : ''}.
          </span>
          <button className="ghost" onClick={() => setManual(true)}>
            Add it by hand
          </button>
        </div>
      )}

      {manual && (
        <form className="row" style={{ width: '100%' }} onSubmit={addTyped}>
          <span className="small muted">Release year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setError(null);
            }}
            min={1880}
            max={THIS_YEAR + 5}
            placeholder={String(THIS_YEAR)}
            style={{ width: 96 }}
            aria-label="Release year"
            autoFocus
          />
          <button className="primary" type="submit" disabled={busy || !query.trim()}>
            {busy ? 'Adding…' : `Add “${query.trim()}”`}
          </button>
        </form>
      )}

      {error && <div className="add-movie-error small">{error}</div>}
    </div>
  );
}
