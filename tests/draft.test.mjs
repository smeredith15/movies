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

export default function run({ loadDraft, saveDraft, clearDraft, readyCount }) {
  const entry = (date) => ({ date, picker: 'me', venue: 'home' });

  suite('draft: unsaved dates survive leaving the page', () => {
    globalThis.localStorage = fakeStorage();

    check('nothing saved yet reads as empty', Object.keys(loadDraft()).length, 0);

    saveDraft({ 'dune-2021': entry('2021-10-22'), 'nope-2022': entry('') });
    const back = loadDraft();
    check('a staged date comes back', back['dune-2021'].date, '2021-10-22');
    check('so does its picker', back['dune-2021'].picker, 'me');
    check('a row touched but not dated is kept too', 'nope-2022' in back, true);
    check('but only dated rows count as ready', readyCount(back), 1);

    clearDraft();
    check('clearing empties it', Object.keys(loadDraft()).length, 0);
  });

  suite('draft: it never breaks the page', () => {
    globalThis.localStorage = fakeStorage({ throws: true });
    check('a storage that refuses to read yields empty', Object.keys(loadDraft()).length, 0);
    let threw = false;
    try {
      saveDraft({ 'dune-2021': entry('2021-10-22') });
    } catch {
      threw = true;
    }
    check('and a storage that refuses to write does not throw', threw, false);

    globalThis.localStorage = fakeStorage();
    globalThis.localStorage.setItem('movies.history.draft', 'not json at all');
    check('corrupt stored data is ignored', Object.keys(loadDraft()).length, 0);
    globalThis.localStorage.setItem('movies.history.draft', 'null');
    check('so is a stored null', Object.keys(loadDraft()).length, 0);
  });

  suite('draft: counting what is ready', () => {
    check('an empty draft is nothing to save', readyCount({}), 0);
    check('blank dates do not count', readyCount({ a: entry(''), b: entry('') }), 0);
    check('dated rows do', readyCount({ a: entry('2024-01-01'), b: entry(''), c: entry('2024-02-02') }), 2);
  });
}
