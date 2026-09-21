import { useState } from 'react';
import type { Config, Picker, Venue, Watch } from '../lib/types';
import { newId } from '../lib/store';
import { TitleInput } from './TitleInput';

const today = () => new Date().toISOString().slice(0, 10);

export function WatchForm({
  config,
  onAdd,
  busy,
}: {
  config: Config;
  onAdd: (w: Watch) => Promise<void>;
  busy: boolean;
}) {
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState('');
  const [movieId, setMovieId] = useState<string | null>(null);
  const [venue, setVenue] = useState<Venue>('home');
  const [picker, setPicker] = useState<Picker>('me');
  const [consumes, setConsumes] = useState(true);
  const [touchedConsumes, setTouchedConsumes] = useState(false);
  const [note, setNote] = useState('');

  // Theater trips are decided together, so they default to joint and free.
  // The user can still override either, which is the whole point.
  function changeVenue(next: Venue) {
    setVenue(next);
    if (next === 'theater') {
      setPicker('joint');
      if (!touchedConsumes) setConsumes(false);
    } else if (picker === 'joint') {
      setPicker('me');
      if (!touchedConsumes) setConsumes(true);
    }
  }

  function changePicker(next: Picker) {
    setPicker(next);
    if (next === 'joint' && !touchedConsumes) setConsumes(false);
    if (next !== 'joint' && !touchedConsumes) setConsumes(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd({
      id: newId('w'),
      date,
      title: title.trim(),
      movieId,
      venue,
      picker,
      consumesTurn: picker === 'joint' ? false : consumes,
      note: note.trim() || undefined,
    });
    setTitle('');
    setMovieId(null);
    setNote('');
    setTouchedConsumes(false);
  }

  return (
    <div className="panel">
      <h2>Log a watch</h2>
      <form className="grid" onSubmit={submit}>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label className="field" style={{ gridColumn: 'span 2' }}>
          <span>Title</span>
          <TitleInput
            value={title}
            onChange={setTitle}
            onPick={(s) => {
              setMovieId(s?.id ?? null);
              if (s) setTitle(s.title);
            }}
          />
        </label>

        <label className="field">
          <span>Where</span>
          <select value={venue} onChange={(e) => changeVenue(e.target.value as Venue)}>
            <option value="home">At home</option>
            <option value="theater">In theaters</option>
          </select>
        </label>

        <label className="field">
          <span>Picked by</span>
          <select value={picker} onChange={(e) => changePicker(e.target.value as Picker)}>
            <option value="me">{config.people.me}</option>
            <option value="her">{config.people.her}</option>
            <option value="joint">Both of us</option>
          </select>
        </label>

        <label className="field full">
          <span>Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. traded so we could catch it before it left theaters"
          />
        </label>

        <div className="full row spread">
          <label className="check">
            <input
              type="checkbox"
              checked={picker === 'joint' ? false : consumes}
              disabled={picker === 'joint'}
              onChange={(e) => {
                setConsumes(e.target.checked);
                setTouchedConsumes(true);
              }}
            />
            Uses a turn
            {picker === 'joint' && <span className="muted"> — joint picks never do</span>}
          </label>
          <button className="primary" type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Add watch'}
          </button>
        </div>
      </form>
    </div>
  );
}
