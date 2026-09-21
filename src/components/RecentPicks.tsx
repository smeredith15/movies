import type { Config, Person, Picker, Watch } from '../lib/types';
import type { TurnState } from '../lib/turns';

/**
 * The last few picks, with the corrections we actually need in practice:
 * whose pick it was, and whether it used a turn. Getting one of those wrong is
 * the usual reason the rotation drifts, and fixing it here re-derives the turn
 * immediately rather than needing an adjustment to paper over it.
 */
export function RecentPicks({
  watches,
  config,
  turnState,
  onUpdate,
  onDelete,
  canEdit,
  busy,
  limit = 8,
}: {
  watches: Watch[];
  config: Config;
  turnState: TurnState;
  onUpdate: (w: Watch) => void;
  onDelete: (w: Watch) => void;
  canEdit: boolean;
  busy: boolean;
  limit?: number;
}) {
  // Dated picks newest first; undated ones trail behind, since they have no
  // place in the order.
  const recent = [...watches]
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : -1;
    })
    .slice(0, limit);

  const tradedIds = new Set(
    turnState.events
      .filter((e) => e.traded && e.kind === 'watch')
      .map((e) => `${e.date}|${e.description}`)
  );

  if (recent.length === 0) {
    return (
      <div className="panel">
        <h2>Recent picks</h2>
        <div className="empty">Nothing logged yet.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>
        Recent picks
        <span className="sub">fix one here and the turn updates</span>
      </h2>

      <ul className="watches">
        {recent.map((w) => {
          const traded =
            w.picker !== 'joint' &&
            tradedIds.has(`${w.date}|${w.title} — picked by ${config.people[w.picker as Person]}`);

          return (
            <li key={w.id}>
              <div className="w-date">{w.date || '—'}</div>
              <div className="w-main">
                <div className="w-title">{w.title}</div>
                <div className="w-meta row">
                  {w.venue === 'theater' && <span className="badge theater">Theater</span>}
                  {traded && <span className="badge traded">Out of turn</span>}
                  {!w.date && <span className="badge traded">No date — not counted</span>}
                  {w.note && <span className="note">{w.note}</span>}
                </div>
              </div>

              {canEdit && (
                <div className="overrides">
                  <div className="seg" role="group" aria-label={`Who picked ${w.title}`}>
                    {(['me', 'her', 'joint'] as Picker[]).map((p) => (
                      <button
                        key={p}
                        className={w.picker === p ? 'on' : ''}
                        disabled={busy}
                        onClick={() =>
                          onUpdate({
                            ...w,
                            picker: p,
                            // A joint pick never uses a turn; switching away
                            // from joint restores one.
                            consumesTurn: p !== 'joint',
                          })
                        }
                      >
                        {p === 'joint' ? 'Both' : config.people[p]}
                      </button>
                    ))}
                  </div>

                  <button
                    className={`chip-toggle ${w.consumesTurn ? 'on' : ''}`}
                    disabled={busy || w.picker === 'joint'}
                    title={
                      w.picker === 'joint'
                        ? 'Joint picks never use a turn'
                        : w.consumesTurn
                          ? 'Counts toward the rotation'
                          : 'Does not count toward the rotation'
                    }
                    onClick={() => onUpdate({ ...w, consumesTurn: !w.consumesTurn })}
                  >
                    {w.consumesTurn ? 'Uses a turn' : 'Free'}
                  </button>

                  <button className="danger" disabled={busy} onClick={() => onDelete(w)}>
                    ×
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
