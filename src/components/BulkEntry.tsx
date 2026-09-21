import { useState } from 'react';
import type { Config, Picker, Venue, Watch } from '../lib/types';
import { newId } from '../lib/store';
import { TitleInput } from './TitleInput';

interface Draft {
  key: string;
  date: string;
  title: string;
  movieId: string | null;
  picker: Picker;
  venue: Venue;
  note: string;
}

const blank = (date: string): Draft => ({
  key: Math.random().toString(36).slice(2),
  date,
  title: '',
  movieId: null,
  picker: 'me',
  venue: 'home',
  note: '',
});

/**
 * Backfill screen. Turn history could not be recovered from the workbook, so
 * this exists to key in past watches quickly — all of them save as a single
 * commit rather than one per row.
 */
export function BulkEntry({
  config,
  onSave,
  busy,
}: {
  config: Config;
  onSave: (watches: Watch[]) => Promise<void>;
  busy: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [drafts, setDrafts] = useState<Draft[]>(() => [blank(today), blank(today), blank(today)]);

  const patch = (key: string, fields: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...fields } : d)));

  const addRow = () =>
    setDrafts((ds) => [...ds, blank(ds[ds.length - 1]?.date ?? today)]);

  const removeRow = (key: string) =>
    setDrafts((ds) => (ds.length === 1 ? ds : ds.filter((d) => d.key !== key)));

  const ready = drafts.filter((d) => d.title.trim());

  async function save() {
    if (!ready.length) return;
    await onSave(
      ready.map((d) => ({
        id: newId('w'),
        date: d.date,
        title: d.title.trim(),
        movieId: d.movieId,
        venue: d.venue,
        picker: d.picker,
        consumesTurn: d.picker !== 'joint',
        note: d.note.trim() || undefined,
      }))
    );
    setDrafts([blank(today), blank(today), blank(today)]);
  }

  return (
    <div className="panel">
      <h2>
        Backfill
        <span className="sub">enter past watches in bulk — saved in one commit</span>
      </h2>

      <div className="bulk">
        <div className="bulk-head">
          <span>Date</span>
          <span>Title</span>
          <span>Picked by</span>
          <span>Where</span>
          <span />
        </div>

        {drafts.map((d) => (
          <div className="bulk-row" key={d.key}>
            <input
              type="date"
              value={d.date}
              onChange={(e) => patch(d.key, { date: e.target.value })}
            />
            <TitleInput
              value={d.title}
              onChange={(title) => patch(d.key, { title })}
              onPick={(s) => patch(d.key, s ? { movieId: s.id, title: s.title } : { movieId: null })}
            />
            <select
              value={d.picker}
              onChange={(e) => patch(d.key, { picker: e.target.value as Picker })}
            >
              <option value="me">{config.people.me}</option>
              <option value="her">{config.people.her}</option>
              <option value="joint">Both</option>
            </select>
            <select
              value={d.venue}
              onChange={(e) => {
                const venue = e.target.value as Venue;
                patch(d.key, venue === 'theater' ? { venue, picker: 'joint' } : { venue });
              }}
            >
              <option value="home">Home</option>
              <option value="theater">Theater</option>
            </select>
            <button className="ghost" onClick={() => removeRow(d.key)} title="Remove row">
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="row spread" style={{ marginTop: 12 }}>
        <button className="ghost" onClick={addRow}>
          + Add row
        </button>
        <button className="primary" onClick={save} disabled={busy || !ready.length}>
          {busy ? 'Saving…' : `Save ${ready.length} watch${ready.length === 1 ? '' : 'es'}`}
        </button>
      </div>

      <p className="small muted" style={{ marginBottom: 0 }}>
        Titles autocomplete against the catalog, which links the watch to that
        year's list. A title that is not in the catalog is fine — it is stored as
        typed. Theater rows default to a joint pick and use nobody's turn.
      </p>
    </div>
  );
}
