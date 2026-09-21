/**
 * Thin GitHub Contents API client used as the app's storage backend.
 *
 * Reads work unauthenticated (the repo is public). Writes need a fine-grained
 * personal access token with Contents: read & write, which each person pastes
 * in once and which lives only in their own browser's localStorage.
 */

export const REPO_OWNER = 'smeredith15';
export const REPO_NAME = 'movies';
export const REPO_BRANCH = 'main';

const API = 'https://api.github.com';
const TOKEN_KEY = 'movies.gh.token';
const WHOAMI_KEY = 'movies.whoami';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the app stays read-only */
  }
}

export function getWhoAmI(): 'me' | 'her' | null {
  try {
    return (localStorage.getItem(WHOAMI_KEY) as 'me' | 'her') || null;
  } catch {
    return null;
  }
}

export function setWhoAmI(who: 'me' | 'her') {
  try {
    localStorage.setItem(WHOAMI_KEY, who);
  } catch {
    /* ignore */
  }
}

function headers(extra: Record<string, string> = {}) {
  const token = getToken();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

const utf8ToBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
};

const base64ToUtf8 = (b64: string) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface FileHandle<T> {
  path: string;
  data: T;
  sha: string | null;
}

/** Read a JSON file. A missing file yields `fallback` with a null sha. */
export async function readJson<T>(path: string, fallback: T): Promise<FileHandle<T>> {
  const url = `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${REPO_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });

  if (res.status === 404) return { path, data: fallback, sha: null };
  if (!res.ok) {
    throw new GitHubError(`Could not read ${path}: ${res.status} ${await res.text()}`, res.status);
  }

  const body = await res.json();
  return { path, data: JSON.parse(base64ToUtf8(body.content)) as T, sha: body.sha };
}

async function writeOnce(path: string, data: unknown, sha: string | null, message: string) {
  const res = await fetch(`${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: utf8ToBase64(`${JSON.stringify(data, null, 2)}\n`),
      branch: REPO_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (res.ok) {
    const body = await res.json();
    return { ok: true as const, sha: body.content.sha as string };
  }
  if (res.status === 409 || res.status === 422) return { ok: false as const, sha: null };
  throw new GitHubError(`Could not write ${path}: ${res.status} ${await res.text()}`, res.status);
}

/**
 * Write with optimistic concurrency. If the other person committed in between,
 * GitHub rejects the stale sha; we re-read their version, replay our change on
 * top via `merge`, and try again. Nobody's edit gets clobbered.
 */
export async function writeJson<T>(
  path: string,
  fallback: T,
  merge: (current: T) => T,
  message: string,
  attempts = 4
): Promise<FileHandle<T>> {
  let handle = await readJson<T>(path, fallback);

  for (let i = 0; i < attempts; i++) {
    const next = merge(handle.data);
    const result = await writeOnce(path, next, handle.sha, message);
    if (result.ok) return { path, data: next, sha: result.sha };

    // Someone else got there first — take their version and reapply.
    await new Promise((r) => setTimeout(r, 200 * 2 ** i));
    handle = await readJson<T>(path, fallback);
  }

  throw new GitHubError(
    `Gave up writing ${path} after ${attempts} attempts — too many concurrent edits.`,
    409
  );
}

/** Merge helper: union two record lists by id, newest write winning per record. */
export function mergeById<T extends { id: string }>(current: T[], mine: T[], removedIds: string[] = []): T[] {
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of mine) byId.set(r.id, r);
  for (const id of removedIds) byId.delete(id);
  return [...byId.values()];
}

export async function verifyToken(): Promise<{ login: string } | null> {
  if (!getToken()) return null;
  const res = await fetch(`${API}/user`, { headers: headers() });
  if (!res.ok) return null;
  return res.json();
}

/** Kick off the catalog workflow from the page. */
export async function dispatchCatalogRefresh(year: number, mode: 'enrich' | 'full' = 'enrich') {
  const res = await fetch(
    `${API}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/refresh-catalog.yml/dispatches`,
    {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ref: REPO_BRANCH, inputs: { year: String(year), mode } }),
    }
  );
  if (!res.ok) {
    throw new GitHubError(`Could not start the refresh: ${res.status} ${await res.text()}`, res.status);
  }
}

export async function latestCatalogRun(): Promise<{
  status: string;
  conclusion: string | null;
  url: string;
  startedAt: string;
} | null> {
  const res = await fetch(
    `${API}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/refresh-catalog.yml/runs?per_page=1`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) return null;
  const body = await res.json();
  const run = body.workflow_runs?.[0];
  if (!run) return null;
  return {
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
    startedAt: run.created_at,
  };
}
