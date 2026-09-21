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

      {state.beforeAnchor > 0 && (
        <div className="small muted" style={{ marginTop: 10 }}>
          Counting from the rotation start — {state.beforeAnchor} earlier{' '}
          {state.beforeAnchor === 1 ? 'pick is' : 'picks are'} kept as history but not counted.
        </div>
      )}

      {state.undatedPicks > 0 && (
        <div className="small muted" style={{ marginTop: 10 }}>
          {state.undatedPicks} {state.undatedPicks === 1 ? 'pick has' : 'picks have'} no date, so
          {state.undatedPicks === 1 ? ' it is' : ' they are'} not counted toward the rotation yet.
        </div>
      )}

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
