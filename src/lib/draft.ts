import type { StagedWatch } from './types';

const KEY = 'movies.history.draft';

export type Draft = Record<string, StagedWatch>;

/**
 * Unsaved History edits, kept in this browser.
 *
 * Dating hundreds of movies is a long session, and the edits only become
 * commits when you press Save. Without this, switching tabs unmounts the page
 * and silently throws the work away — which is exactly what happened.
 */
export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Draft) : {};
  } catch {
    return {};
  }
}

export const DRAFT_EVENT = 'movies:draft';

export function saveDraft(draft: Draft) {
  try {
    if (Object.keys(draft).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota. The edits still live in React state
    // for this visit; they just will not survive leaving the page.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: readyCount(draft) }));
  }
}

export function clearDraft() {
  saveDraft({});
}

/** How many rows are filled in enough to save. */
export const readyCount = (draft: Draft) =>
  Object.values(draft).filter((d) => d.date).length;
