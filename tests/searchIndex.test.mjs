import { check, suite } from './harness.mjs';

export default function run({ toIndexRow, buildSearchIndex }) {
  suite('search index: one row per film', () => {
    const row = toIndexRow({ id: 'digger-2026', title: 'Digger', seen: true }, 2026);
    check('id, title, year, seen', row.join('|'), 'digger-2026|Digger|2026|1');
    check('unseen is zero, not false', toIndexRow({ id: 'a', title: 'A' }, 2026)[3], 0);

    // The year comes from the file the film is in, not from computedYear: the
    // catalogs are organised by year and the search's tie-breaking trusts that.
    const moved = toIndexRow({ id: 'a-2026', title: 'A', computedYear: 2027 }, 2026);
    check('the catalog year wins', moved[2], 2026);
  });

  suite('search index: every catalog, newest first', () => {
    const rows = buildSearchIndex([
      ['2026', [{ id: 'b-2026', title: 'Beta' }, { id: 'a-2026', title: 'Alpha' }]],
      ['2025', [{ id: 'z-2025', title: 'Zeta', seen: true }]],
    ]);
    check('everything is included', rows.length, 3);
    check('newest year first', rows[0][2], 2026);
    check('then alphabetical', rows.map((r) => r[1]).join(','), 'Alpha,Beta,Zeta');
    check('the older year follows', rows[2][2], 2025);
  });

  suite('search index: nothing malformed reaches the browser', () => {
    const rows = buildSearchIndex([
      ['2026', [{ id: 'a-2026', title: 'A' }, { id: null, title: 'No id' }, { id: 'b-2026' }, null]],
    ]);
    check('a row with no id is dropped', rows.length, 1);
    check('and the good one survives', rows[0][0], 'a-2026');

    // Ids embed the year so a collision should not happen, but the suggestion
    // list has no dedupe of its own — one row per id has to be guaranteed here.
    const dupes = buildSearchIndex([
      ['2026', [{ id: 'a-2026', title: 'Old name' }]],
      ['2026', [{ id: 'a-2026', title: 'New name' }]],
    ]);
    check('an id appears once', dupes.length, 1);
    check('and carries the later reading', dupes[0][1], 'New name');

    check('a year with no catalog is not a crash', buildSearchIndex([['2026', null]]).length, 0);
    check('nor is no years at all', buildSearchIndex([]).length, 0);
  });
}
