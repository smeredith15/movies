import type { Config } from '../lib/types';
import type { TurnState } from '../lib/turns';
import { describeTurn } from '../lib/turns';

export function TurnPanel({ state, config }: { state: TurnState; config: Config }) {
  const recentTrades = state.events.filter((e) => e.traded).slice(-3).reverse();

  return (
    <div className="panel turn-hero">
      <div className="label">Up next</div>
      <div className={`who ${state.upNext}`}>{config.people[state.upNext]}</div>
      <div className="detail">{describeTurn(state, config)}</div>

      <div className="queue">
        {state.queue.map((p, i) => (
          <span key={i} className={`chip ${p} ${i === 0 ? 'first' : ''}`}>
            {config.people[p]}
          </span>
        ))}
      </div>

      <div className="detail small" style={{ marginTop: 14 }}>
        Picks so far — {config.people.me}: {state.used.me} · {config.people.her}: {state.used.her}
      </div>

      {recentTrades.length > 0 && (
        <div className="small muted" style={{ marginTop: 10 }}>
          Recent out-of-turn picks:{' '}
          {recentTrades.map((e, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {e.description}
              {e.note ? ` (${e.note})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
