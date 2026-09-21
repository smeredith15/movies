/**
 * Unsaved edits, kept in this browser.
 *
 * Both the History and Browse tabs stage a lot of small changes before saving
 * them as one commit, and both unmount when you switch tabs — so what is
 * staged has to outlive the component or the work is silently thrown away.
 */

export const HISTORY_DRAFT = 'movies.history.draft';
export const BROWSE_DRAFT = 'movies.browse.draft';
export const DRAFT_EVENT = 'movies:draft';

export type Draft<T> = Record<string, T>;

export function loadDraft<T>(key: string): Draft<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Draft<T>) : {};
  } catch {
    return {};
  }
}

export function saveDraft<T>(key: string, draft: Draft<T>) {
  try {
    if (Object.keys(draft).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota. The edits still live in React state
    // for this visit; they just will not survive leaving the page.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: totalUnsaved() }));
  }
}

export function clearDraft(key: string) {
  saveDraft(key, {});
}

export const draftSize = <T,>(draft: Draft<T>) => Object.keys(draft).length;

/** Everything staged anywhere, for the marker in the tab bar. */
export function totalUnsaved(): number {
  return draftSize(loadDraft(HISTORY_DRAFT)) + draftSize(loadDraft(BROWSE_DRAFT));
}
