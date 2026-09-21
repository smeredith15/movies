import { useEffect, useMemo, useState } from 'react';
import type { CatalogMovie, Config, EligibilityOverride, Person, Watch } from '../lib/types';
import {
  buildPool,
  buildUnwatchedPool,
  isFilled,
  loadBallot,
  loadCategories,
  loadExtras,
  loadFullCatalog,
  saveExtras,
  type Ballot as BallotData,
  type BallotCategory,
  type BallotExtras,
  type CategoryBallot,
  type Entry,
  type PoolMovie,
} from '../lib/ballot';
import { loadCatalog } from '../lib/store';
import { clearDraft, loadDraft, saveDraft } from '../lib/draft';

const MENTION_SLOTS = 4;

interface CastOption {
  name: string;
  character?: string;
  movie: string;
}

/**
 * The year-end ballot.
 *
 * Every category takes one winner and up to four honorable mentions. What a
 * slot accepts depends on the category: a film from the year's pool, an actor
 * or character drawn from its cast, a film plus something typed, or plain
 * text. Every category also accepts a write-in, because the pool is built from
 * sources and the sources miss things.
 */
export function Ballot({
  year,
  years,
  onYearChange,
  whoami,
  config,
  watches,
  overrides,
  canEdit,
  busy,
  onSave,
  onMutate,
}: {
  year: number;
  years: number[];
  onYearChange: (y: number) => void;
  whoami: Person | null;
  config: Config;
  watches: Watch[];
  overrides: EligibilityOverride[];
  canEdit: boolean;
  busy: boolean;
  onSave: (ballot: BallotData) => Promise<void>;
  onMutate: (run: () => Promise<void>) => Promise<void>;
}) {
  const [categories, setCategories] = useState<BallotCategory[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null);
  const [extras, setExtras] = useState<BallotExtras>({});
  const [saved, setSaved] = useState<BallotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cast, setCast] = useState<CastOption[] | null>(null);

  const draftKey = `movies.ballot.${year}.${whoami ?? 'anon'}`;
  const [entries, setEntries] = useState<Record<string, CategoryBallot>>({});

  useEffect(() => {
    let live = true;
    setCategories(null);
    setCatalog(null);
    setCast(null);
    setError(null);

    Promise.all([
      loadCategories(),
      loadCatalog(year),
      loadExtras(),
      whoami ? loadBallot(year, whoami) : Promise.resolve(null),
    ])
      .then(([cats, cat, ex, ballot]) => {
        if (!live) return;
        setCategories(cats);
        setCatalog(cat);
        setExtras(ex);
        setSaved(ballot);
        const draft = loadDraft<CategoryBallot>(draftKey);
        setEntries(Object.keys(draft).length ? draft : (ballot?.entries ?? {}));
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));

    return () => {
      live = false;
    };
  }, [year, whoami, draftKey]);

  useEffect(() => {
    if (categories) saveDraft(draftKey, entries);
  }, [entries, draftKey, categories]);

  const pool = useMemo(
    () =>
      catalog ? buildPool(year, catalog, watches, overrides, extras, config) : [],
    [catalog, year, watches, overrides, extras, config]
  );
  const unwatched = useMemo(
    () => (catalog ? buildUnwatchedPool(year, catalog, pool) : []),
    [catalog, year, pool]
  );

  /** Cast is the bulk of a catalog, so it is only fetched when a category needs it. */
  async function ensureCast() {
    if (cast) return;
    const full = await loadFullCatalog(year);
    const ids = new Set(pool.map((m) => m.id));
    const out: CastOption[] = [];
    for (const movie of full) {
      if (!ids.has(movie.id)) continue;
      for (const c of movie.cast ?? []) {
        out.push({ name: c.name, character: c.character, movie: movie.title });
      }
    }
    setCast(out);
  }

  const setEntry = (categoryId: string, patch: Partial<CategoryBallot>) =>
    setEntries((e) => ({ ...e, [categoryId]: { ...e[categoryId], ...patch } }));

  const dirty = JSON.stringify(entries) !== JSON.stringify(saved?.entries ?? {});

  async function save() {
    if (!whoami) return;
    await onSave({
      year,
      person: whoami,
      submitted: saved?.submitted ?? false,
      entries,
    });
    setSaved({ year, person: whoami, submitted: saved?.submitted ?? false, entries });
    clearDraft(draftKey);
  }

  if (!whoami) {
    return (
      <div className="panel">
        <h2>{year} ballot</h2>
        <div className="banner warn" style={{ marginBottom: 0 }}>
          Say who you are under Settings first — a ballot belongs to one of you.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <h2>{year} ballot</h2>
        <div className="banner error" style={{ marginBottom: 0 }}>{error}</div>
      </div>
    );
  }

  if (!categories || !catalog) {
    return (
      <div className="panel">
        <div className="empty">Loading the {year} ballot…</div>
      </div>
    );
  }

  const frozen = (config.frozenYears ?? []).includes(year);
  const filled = categories.filter((c) => isFilled(entries[c.id]?.winner)).length;

  return (
    <>
      <div className="panel">
        <h2>
          {year} ballot
          <span className="sub">
            {config.people[whoami]} · {filled} of {categories.length} categories
          </span>
        </h2>

        <div className="row spread">
          <div className="row">
            <select value={year} onChange={(e) => onYearChange(Number(e.target.value))} style={{ width: 96 }}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="small muted">
              {pool.length} eligible {frozen ? '· locked at the ceremony' : '· still filling as you watch'}
            </span>
          </div>
          {canEdit && (
            <button className="primary" onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : dirty ? 'Save ballot' : 'Saved'}
            </button>
          )}
        </div>

        {pool.length === 0 && (
          <div className="banner warn" style={{ marginTop: 12, marginBottom: 0 }}>
            Nothing is eligible for {year} yet.{' '}
            {frozen
              ? 'This year is frozen, so its pool comes from the Awards sheet.'
              : 'A film joins once it is marked watched inside the ballot window — set that on the History tab.'}
          </div>
        )}

        {canEdit && (
          <PoolFixup
            year={year}
            catalog={catalog}
            pool={pool}
            busy={busy}
            onAdd={async (id, title) => {
              await onMutate(async () => {
                await saveExtras(year, { added: [id] }, `Add ${title} to the ${year} ballot`);
              });
              setExtras(await loadExtras());
            }}
          />
        )}

        <p className="small muted" style={{ marginBottom: 0 }}>
          Your ballot saves to its own file and is never shown alongside{' '}
          {config.people[whoami === 'me' ? 'her' : 'me']}&rsquo;s.
        </p>
      </div>

      {categories.map((category) => (
        <CategoryPanel
          key={category.id}
          category={category}
          value={entries[category.id] ?? {}}
          pool={category.pool === 'unwatched' ? unwatched : pool}
          cast={cast}
          onNeedCast={ensureCast}
          onChange={(patch) => setEntry(category.id, patch)}
          open={openId === category.id}
          onToggle={() => setOpenId(openId === category.id ? null : category.id)}
          canEdit={canEdit}
        />
      ))}
    </>
  );
}

function CategoryPanel({
  category,
  value,
  pool,
  cast,
  onNeedCast,
  onChange,
  open,
  onToggle,
  canEdit,
}: {
  category: BallotCategory;
  value: CategoryBallot;
  pool: CatalogMovie[] | PoolMovie[];
  cast: CastOption[] | null;
  onNeedCast: () => void;
  onChange: (patch: Partial<CategoryBallot>) => void;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
}) {
  const type = value.type ?? category.type;
  const needsCast = type === 'person' || type === 'character';

  useEffect(() => {
    if (open && needsCast) onNeedCast();
  }, [open, needsCast, onNeedCast]);

  const mentions = value.mentions ?? [];
  const filledMentions = mentions.filter(isFilled).length;
  const name = value.name || category.name || category.namePlaceholder || 'Untitled';

  const setMention = (i: number, entry: Entry) => {
    const next = [...mentions];
    next[i] = entry;
    onChange({ mentions: next });
  };

  const listId = `pool-${category.id}`;
  const castListId = `cast-${category.id}`;

  return (
    <div className="panel category">
      <button className="ghost cat-head" onClick={onToggle} aria-expanded={open}>
        <span className="cat-name">
          {open ? '▾' : '▸'} {name}
          {category.custom && !value.name && <span className="badge free">yours to name</span>}
        </span>
        <span className="cat-state small muted">
          {isFilled(value.winner) ? '1 winner' : 'no winner'}
          {filledMentions > 0 && ` · ${filledMentions} mention${filledMentions === 1 ? '' : 's'}`}
          {!category.scored && ' · unscored'}
        </span>
      </button>

      {open && (
        <div className="cat-body">
          {/* One list per category, shared by its five slots — a datalist per
              slot would repeat the whole pool five times over, with a
              duplicated id each time. */}
          <datalist id={listId}>
            {pool.map((m) => (
              <option key={m.id} value={m.title} />
            ))}
          </datalist>
          {needsCast && (
            <datalist id={castListId}>
              {(cast ?? []).slice(0, 2000).map((c, i) => (
                <option
                  key={i}
                  value={type === 'person' ? c.name : (c.character ?? c.name)}
                  label={`${c.movie}${type === 'person' && c.character ? ` — ${c.character}` : ''}`}
                />
              ))}
            </datalist>
          )}
          {category.custom && canEdit && (
            <div className="row">
              <input
                value={value.name ?? ''}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder={category.namePlaceholder}
                style={{ flex: 1, minWidth: 140 }}
                aria-label="Category name"
              />
              <select
                value={type}
                onChange={(e) => onChange({ type: e.target.value })}
                aria-label="What this category takes"
              >
                {(category.allowedTypes ?? ['movie']).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsCast && cast !== null && cast.length === 0 && (
            <div className="banner warn small">
              No cast on file for these films, so there is nothing to suggest — type the
              name instead. Running <strong>Refresh catalog</strong> for this year in
              <em> enrich</em> mode fetches cast from TMDB.
            </div>
          )}

          <div className="slot-label small muted">
            Winner{category.scored ? ` · ${category.scoring.winner} pts` : ''}
          </div>
          <EntrySlot
            type={type}
            textLabel={category.textLabel}
            pool={pool}
            cast={cast}
            listId={listId}
            castListId={castListId}
            value={value.winner ?? {}}
            onChange={(entry) => onChange({ winner: entry })}
            canEdit={canEdit}
          />

          <div className="slot-label small muted" style={{ marginTop: 10 }}>
            Honorable mentions
            {category.scored && category.scoring.honorableMentions[0] > 0
              ? ` · ${category.scoring.honorableMentions[0]} pts each`
              : ' · no points'}
          </div>
          {Array.from({ length: MENTION_SLOTS }, (_, i) => (
            <EntrySlot
              key={i}
              type={type}
              textLabel={category.textLabel}
              pool={pool}
              cast={cast}
              listId={listId}
              castListId={castListId}
              value={mentions[i] ?? {}}
              onChange={(entry) => setMention(i, entry)}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  movie: 'A movie',
  person: 'An actor or actress',
  character: 'A character',
  movieText: 'A movie, plus something typed',
  free: 'Anything — just type it',
};

function EntrySlot({
  type,
  textLabel,
  pool,
  cast,
  listId,
  castListId,
  value,
  onChange,
  canEdit,
}: {
  type: string;
  textLabel?: string;
  pool: CatalogMovie[] | PoolMovie[];
  cast: CastOption[] | null;
  listId: string;
  castListId: string;
  value: Entry;
  onChange: (entry: Entry) => void;
  canEdit: boolean;
}) {
  const set = (patch: Partial<Entry>) => onChange({ ...value, ...patch });

  if (type === 'free') {
    return (
      <input
        className="slot"
        value={value.text ?? ''}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Type your answer"
        disabled={!canEdit}
      />
    );
  }

  const movieField = (
    <input
      className="slot"
      list={listId}
        value={value.writeIn ?? titleOf(pool, value.movieId) ?? ''}
        onChange={(e) => {
          const match = pool.find((m) => m.title === e.target.value);
          // Anything not in the pool is kept as a write-in rather than lost.
          set(match ? { movieId: match.id, writeIn: undefined } : { movieId: null, writeIn: e.target.value });
        }}
      placeholder="Pick a movie, or write one in"
      disabled={!canEdit}
    />
  );

  if (type === 'movie') return <div className="slot-row">{movieField}</div>;

  if (type === 'movieText') {
    return (
      <div className="slot-row">
        {movieField}
        <input
          className="slot"
          value={value.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
          placeholder={textLabel ?? 'Describe it'}
          disabled={!canEdit}
        />
      </div>
    );
  }

  // person or character
  return (
    <div className="slot-row">
      <input
        className="slot"
        list={castListId}
        value={value.person ?? ''}
        onChange={(e) => set({ person: e.target.value })}
        placeholder={cast === null ? 'Loading cast…' : type === 'person' ? 'Actor or actress' : 'Character'}
        disabled={!canEdit}
      />
      {movieField}
    </div>
  );
}

function titleOf(pool: CatalogMovie[] | PoolMovie[], movieId?: string | null) {
  if (!movieId) return null;
  return pool.find((m) => m.id === movieId)?.title ?? null;
}

/**
 * Puts a film onto a ballot it was missing from.
 *
 * A frozen year takes its pool from the Awards sheet, and those sheets have
 * gaps — a film watched in the window that never got written down. That is a
 * hole in the record rather than a ruling, so it can be filled afterwards.
 */
function PoolFixup({
  year,
  catalog,
  pool,
  busy,
  onAdd,
}: {
  year: number;
  catalog: CatalogMovie[];
  pool: PoolMovie[];
  busy: boolean;
  onAdd: (id: string, title: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  if (!open) {
    return (
      <div className="row" style={{ marginTop: 10 }}>
        <button className="ghost" onClick={() => setOpen(true)}>
          + Add a movie to this ballot
        </button>
      </div>
    );
  }

  const inPool = new Set(pool.map((m) => m.id));
  const candidates = catalog
    .filter((m) => !inPool.has(m.id) && m.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="add-movie" style={{ marginTop: 10 }}>
      <div className="row" style={{ width: '100%' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find a ${year} movie missing from the ballot`}
          autoFocus
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {query.trim().length >= 2 && (
        <ul className="tmdb-results">
          {candidates.length === 0 && <li className="muted small">Nothing else in the {year} catalog matches.</li>}
          {candidates.map((m) => (
            <li key={m.id}>
              <span className="combo-title">{m.title}</span>
              <span className="combo-meta">{m.computedYear}</span>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  await onAdd(m.id, m.title);
                  setQuery('');
                  setOpen(false);
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
