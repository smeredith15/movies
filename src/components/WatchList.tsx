import type { Config, Watch } from '../lib/types';
import type { TurnState } from '../lib/turns';
import { watchWindowForFilmYear } from '../../shared/eligibility.js';

function groupByYear(watches: Watch[]) {
  const groups = new Map<number, Watch[]>();
  for (const w of watches) {
    const y = Number(w.date.slice(0, 4));
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y)!.push(w);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({
      year,
      items: items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }));
}

export function WatchList({
  watches,
  config,
  turnState,
  onDelete,
  canEdit,
}: {
  watches: Watch[];
  config: Config;
  turnState: TurnState;
  onDelete: (w: Watch) => void;
  canEdit: boolean;
}) {
  if (watches.length === 0) {
    return (
      <div className="panel">
        <div className="empty">No watches logged yet.</div>
      </div>
    );
  }

  // Which picks were made out of turn, so the history can show it.
  const tradedTitles = new Set(
    turnState.events.filter((e) => e.traded && e.kind === 'watch').map((e) => `${e.date}|${e.description}`)
  );

  return (
    <>
      {groupByYear(watches).map(({ year, items }) => {
        const window = watchWindowForFilmYear(year, config.oscarDates);
        const counted = items.filter((w) => w.consumesTurn).length;
        return (
          <div key={year}>
            <div className="season-head">
              <h3>{year}</h3>
              <span className="range">
                {items.length} watched · {counted} used a turn · ballot season runs{' '}
                {window.start} → {window.end}
              </span>
            </div>
            <div className="panel">
              <ul className="watches">
                {items.map((w) => {
                  const traded =
                    w.picker !== 'joint' &&
                    tradedTitles.has(`${w.date}|${w.title} — picked by ${config.people[w.picker]}`);
                  return (
                    <li key={w.id}>
                      <div className="w-date">{w.date.slice(5)}</div>
                      <div className="w-main">
                        <div className="w-title">{w.title}</div>
                        <div className="w-meta row">
                          <span className={`badge ${w.picker}`}>
                            {w.picker === 'joint' ? 'Both of us' : config.people[w.picker]}
                          </span>
                          {w.venue === 'theater' && <span className="badge theater">Theater</span>}
                          {!w.consumesTurn && <span className="badge free">No turn used</span>}
                          {traded && <span className="badge traded">Out of turn</span>}
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
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </>
  );
}
