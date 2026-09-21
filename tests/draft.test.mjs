import { check, suite } from './harness.mjs';

/** A throwaway localStorage, plus one that refuses to cooperate. */
function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem: (k) => {
      if (throws) throw new Error('denied');
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => {
      if (throws) throw new Error('quota');
      map.set(k, v);
    },
    removeItem: (k) => {
      if (throws) throw new Error('denied');
      map.delete(k);
    },
  };
}

export default function run({
  loadDraft,
  saveDraft,
  clearDraft,
  draftSize,
  totalUnsaved,
  HISTORY_DRAFT,
  BROWSE_DRAFT,
}) {
  const entry = (date) => ({ date, picker: 'me', venue: 'home' });

  suite('draft: unsaved edits survive leaving the page', () => {
    globalThis.localStorage = fakeStorage();

    check('nothing saved yet reads as empty', draftSize(loadDraft(HISTORY_DRAFT)), 0);

    saveDraft(HISTORY_DRAFT, { 'dune-2021': entry('2021-10-22'), 'nope-2022': entry('') });
    const back = loadDraft(HISTORY_DRAFT);
    check('a staged date comes back', back['dune-2021'].date, '2021-10-22');
    check('so does its picker', back['dune-2021'].picker, 'me');
    check('a row touched but left blank is kept too', 'nope-2022' in back, true);
    check('both count as staged', draftSize(back), 2);

    clearDraft(HISTORY_DRAFT);
    check('clearing empties it', draftSize(loadDraft(HISTORY_DRAFT)), 0);
  });

  suite('draft: the two tabs do not collide', () => {
    globalThis.localStorage = fakeStorage();
    saveDraft(HISTORY_DRAFT, { a: entry('2024-01-01') });
    saveDraft(BROWSE_DRAFT, { b: { seen: true }, c: { wantToSee: 8 } });

    check('history keeps its own', draftSize(loadDraft(HISTORY_DRAFT)), 1);
    check('browse keeps its own', draftSize(loadDraft(BROWSE_DRAFT)), 2);
    check('the tab bar counts both', totalUnsaved(), 3);

    clearDraft(BROWSE_DRAFT);
    check('clearing one leaves the other', draftSize(loadDraft(HISTORY_DRAFT)), 1);
    check('and the total follows', totalUnsaved(), 1);
  });

  suite('draft: it never breaks the page', () => {
    globalThis.localStorage = fakeStorage({ throws: true });
    check('a storage that refuses to read yields empty', draftSize(loadDraft(HISTORY_DRAFT)), 0);
    let threw = false;
    try {
      saveDraft(HISTORY_DRAFT, { 'dune-2021': entry('2021-10-22') });
    } catch {
      threw = true;
    }
    check('and one that refuses to write does not throw', threw, false);

    globalThis.localStorage = fakeStorage();
    globalThis.localStorage.setItem(HISTORY_DRAFT, 'not json at all');
    check('corrupt stored data is ignored', draftSize(loadDraft(HISTORY_DRAFT)), 0);
    globalThis.localStorage.setItem(HISTORY_DRAFT, 'null');
    check('so is a stored null', draftSize(loadDraft(HISTORY_DRAFT)), 0);
    globalThis.localStorage.setItem(HISTORY_DRAFT, '[1,2,3]');
    check('and an array, which is not a draft', draftSize(loadDraft(HISTORY_DRAFT)), 0);
  });
}
