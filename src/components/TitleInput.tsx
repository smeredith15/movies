import { useEffect, useRef, useState } from 'react';
import { loadIndex, searchIndex, type IndexRow, type Suggestion } from '../lib/catalogIndex';

/**
 * Title field backed by the catalog index. Picking a suggestion links the watch
 * to a catalog entry, which is what lets a year's history know what we saw.
 * Typing a title that is not in the catalog is always allowed.
 */
export function TitleInput({
  value,
  onChange,
  onPick,
  placeholder = 'Movie title',
  autoFocus,
}: {
  value: string;
  onChange: (title: string) => void;
  onPick: (s: Suggestion | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [rows, setRows] = useState<IndexRow[]>([]);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadIndex().then(setRows);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function update(next: string) {
    onChange(next);
    onPick(null); // typing breaks the link until another suggestion is chosen
    const found = searchIndex(rows, next);
    setHits(found);
    setCursor(0);
    setOpen(found.length > 0);
  }

  function choose(s: Suggestion) {
    onChange(s.title);
    onPick(s);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter' && hits[cursor]) {
      e.preventDefault();
      choose(hits[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={box}>
      <input
        value={value}
        onChange={(e) => update(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => hits.length && setOpen(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        required
      />
      {open && (
        <ul className="combo-list">
          {hits.map((s, i) => (
            <li
              key={s.id}
              className={i === cursor ? 'active' : ''}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
            >
              <span className="combo-title">{s.title}</span>
              <span className="combo-meta">
                {s.year}
                {s.seen && ' · seen'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
