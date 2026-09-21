import { useState } from 'react';
import type { AddedMovie } from '../lib/added';
import { slugifyTitle } from '../lib/added';

const THIS_YEAR = new Date().getUTCFullYear();

/**
 * For anything we watched that the workbook never listed — an older film, an
 * obscure release, something the scraper missed.
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
  const [title, setTitle] = useState('');
  const [year, setYear] = useState(String(THIS_YEAR));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    const y = Number(year);

    if (!clean) return;
    if (!Number.isInteger(y) || y < 1880 || y > THIS_YEAR + 5) {
      setError(`${year} is not a release year we can use.`);
      return;
    }

    const id = slugifyTitle(clean, y);
    if (existingIds.has(id)) {
      setError(`${clean} (${y}) is already in the list.`);
      return;
    }

    setError(null);
    await onAdd({ id, title: clean, year: y, addedAt: new Date().toISOString() });
    setTitle('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="ghost" onClick={() => setOpen(true)}>
        + Add a movie
      </button>
    );
  }

  return (
    <form className="add-movie" onSubmit={submit}>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(null);
        }}
        placeholder="Title"
        autoFocus
        required
      />
      <input
        type="number"
        value={year}
        onChange={(e) => {
          setYear(e.target.value);
          setError(null);
        }}
        min={1880}
        max={THIS_YEAR + 5}
        aria-label="Release year"
      />
      <button className="primary" type="submit" disabled={busy || !title.trim()}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button
        className="ghost"
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
      >
        Cancel
      </button>
      {error && <div className="add-movie-error small">{error}</div>}
    </form>
  );
}
