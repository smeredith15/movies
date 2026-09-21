import { useEffect, useState } from 'react';
import type { Config, Person } from '../lib/types';
import { getToken, getWhoAmI, setToken, setWhoAmI, verifyToken } from '../lib/github';

export function Settings({
  config,
  onSaveConfig,
  onIdentityChange,
  busy,
}: {
  config: Config;
  onSaveConfig: (c: Config) => Promise<void>;
  onIdentityChange: () => void;
  busy: boolean;
}) {
  const [tokenInput, setTokenInput] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [draft, setDraft] = useState<Config>(config);

  useEffect(() => setDraft(config), [config]);

  useEffect(() => {
    if (!getToken()) return;
    verifyToken().then((u) => setLogin(u?.login ?? null));
  }, []);

  async function saveToken() {
    setChecking(true);
    setToken(tokenInput.trim() || null);
    const user = await verifyToken();
    setLogin(user?.login ?? null);
    if (!user) setToken(null);
    setTokenInput('');
    setChecking(false);
    onIdentityChange();
  }

  function signOut() {
    setToken(null);
    setLogin(null);
    onIdentityChange();
  }

  const whoami = getWhoAmI();

  return (
    <>
      <div className="panel">
        <h2>
          Who are you?
          <span className="sub">so the app knows whose ballot to open</span>
        </h2>
        <div className="row">
          {(['me', 'her'] as Person[]).map((p) => (
            <button
              key={p}
              className={whoami === p ? 'primary' : 'ghost'}
              onClick={() => {
                setWhoAmI(p);
                onIdentityChange();
              }}
            >
              {config.people[p]}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Stored only in this browser. Pick once per device.
        </p>
      </div>

      <div className="panel">
        <h2>
          GitHub access
          <span className="sub">needed to save changes</span>
        </h2>
        {login ? (
          <div className="row spread">
            <span className="small">
              Signed in as <code>{login}</code> — changes will save.
            </span>
            <button className="ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <>
            <div className="banner warn">
              Read-only right now. Paste a token below to enable saving.
            </div>
            <div className="row">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="github_pat_…"
                style={{ flex: 1, minWidth: 220 }}
              />
              <button className="primary" onClick={saveToken} disabled={checking || !tokenInput.trim()}>
                {checking ? 'Checking…' : 'Save token'}
              </button>
            </div>
            <p className="small muted">
              Create a fine-grained token at{' '}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
              >
                github.com/settings/personal-access-tokens
              </a>
              , scoped to this repository, with <strong>Contents: read &amp; write</strong> and{' '}
              <strong>Actions: read &amp; write</strong>. It is kept in this browser only and never
              committed.
            </p>
          </>
        )}
      </div>

      <div className="panel">
        <h2>
          This build
          <span className="sub">check here before suspecting a stale page</span>
        </h2>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Running <code>{__BUILD__}</code>. Compare it with the latest commit on{' '}
          <a
            href="https://github.com/smeredith15/movies/commits/main"
            target="_blank"
            rel="noreferrer"
          >
            main
          </a>
          . If it is behind, the deploy is still running or this page needs a hard reload.
        </p>
      </div>

      <div className="panel">
        <h2>
          Install it
          <span className="sub">same app, off the home screen instead of a bookmark</span>
        </h2>
        <p className="small muted">
          There is nothing to download from a store — the page installs itself. On an iPhone or
          iPad, open it in Safari and tap <strong>Share → Add to Home Screen</strong>. On Android,
          Chrome offers <strong>Install app</strong> in its menu. On a computer, Chrome and Edge
          show an install button at the right of the address bar.
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          It then opens full screen with its own icon, and the app itself keeps working without a
          connection. The watch list and the ballots do not: those are read from GitHub every time,
          on purpose, so neither of us is ever shown a version the other has already changed. Your
          token is stored per browser, so the installed copy will ask for one the first time.
        </p>
      </div>

      <div className="panel">
        <h2>Rotation</h2>
        <div className="grid">
          <label className="field">
            <span>Your name</span>
            <input
              value={draft.people.me}
              onChange={(e) => setDraft({ ...draft, people: { ...draft.people, me: e.target.value } })}
            />
          </label>
          <label className="field">
            <span>Her name</span>
            <input
              value={draft.people.her}
              onChange={(e) => setDraft({ ...draft, people: { ...draft.people, her: e.target.value } })}
            />
          </label>
          <label className="field">
            <span>Picks per turn</span>
            <input
              type="number"
              min={1}
              max={5}
              value={draft.picksPerTurn}
              onChange={(e) => setDraft({ ...draft, picksPerTurn: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label className="field">
            <span>Rotation starts with</span>
            <select
              value={draft.rotationStart}
              onChange={(e) => setDraft({ ...draft, rotationStart: e.target.value as Person })}
            >
              <option value="me">{draft.people.me}</option>
              <option value="her">{draft.people.her}</option>
            </select>
          </label>
          <label className="field">
            <span>Rotation starts</span>
            <input
              type="date"
              value={draft.rotationAnchor ?? ''}
              onChange={(e) => setDraft({ ...draft, rotationAnchor: e.target.value || null })}
            />
          </label>
          <div className="full row spread">
            <span className="small muted">
              The two-and-two rotation begins on that date. Earlier picks stay in the history but
              do not decide whose turn it is now. Changing any of this replays the whole history.
            </span>
            <button className="primary" onClick={() => onSaveConfig(draft)} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
