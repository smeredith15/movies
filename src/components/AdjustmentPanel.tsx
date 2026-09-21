import { useState } from 'react';
import type { Adjustment, AdjustmentType, Config, Person } from '../lib/types';
import { newId } from '../lib/store';

export function AdjustmentPanel({
  config,
  adjustments,
  onAdd,
  onDelete,
  canEdit,
  busy,
}: {
  config: Config;
  adjustments: Adjustment[];
  onAdd: (a: Adjustment) => Promise<void>;
  onDelete: (a: Adjustment) => void;
  canEdit: boolean;
  busy: boolean;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<AdjustmentType>('grant');
  const [who, setWho] = useState<Person>('me');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onAdd({ id: newId('a'), date, type, who, count, note: note.trim() || undefined });
    setNote('');
    setCount(1);
  }

  const sorted = [...adjustments].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="panel">
      <h2>
        Adjustments
        <span className="sub">bonus picks, skips, anything off-rotation</span>
      </h2>

      {canEdit && (
        <form className="grid" onSubmit={submit}>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>What happened</span>
            <select value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
              <option value="grant">Gets an extra pick</option>
              <option value="skip">Gives up a pick</option>
            </select>
          </label>
          <label className="field">
            <span>Who</span>
            <select value={who} onChange={(e) => setWho(e.target.value as Person)}>
              <option value="me">{config.people.me}</option>
              <option value="her">{config.people.her}</option>
            </select>
          </label>
          <label className="field">
            <span>How many</span>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
            />
          </label>
          <label className="field full">
            <span>Why (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. lost a bet on the game"
            />
          </label>
          <div className="full row spread">
            <span className="small muted">
              An extra pick goes to the front of the queue; a skip removes that person's next slot.
            </span>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="empty">Nothing off-rotation yet.</div>
      ) : (
        <ul className="watches" style={{ marginTop: 14 }}>
          {sorted.map((a) => (
            <li key={a.id}>
              <div className="w-date">{a.date.slice(5)}</div>
              <div className="w-main">
                <div className="w-title">
                  {config.people[a.who]} {a.type === 'grant' ? 'gains' : 'gives up'} {a.count} pick
                  {a.count === 1 ? '' : 's'}
                </div>
                {a.note && <div className="note">{a.note}</div>}
              </div>
              {canEdit && (
                <div className="w-actions">
                  <button className="danger" onClick={() => onDelete(a)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
