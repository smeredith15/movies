import { check, suite } from './harness.mjs';

export default function run({ searchIndex }) {
  /** [id, title, year, seen] */
  const rows = [
    ['dune-part-two-2024', 'Dune: Part Two', 2024, 1],
    ['dune-2021', 'Dune', 2021, 1],
    ['the-brutalist-2024', 'The Brutalist', 2024, 1],
    ['brutal-honesty-2019', 'Brutal Honesty', 2019, 0],
    ['wicked-part-one-2024', 'Wicked: Part One', 2024, 1],
    ['a-real-pain-2024', 'A Real Pain', 2024, 0],
  ];
  const titles = (q, n) => searchIndex(rows, q, n).map((s) => s.title);

  suite('autocomplete: finding the title you meant', () => {
    check('an exact title wins', titles('Dune')[0], 'Dune');
    check('a prefix matches the longer title too', titles('Dune').length, 2);
    check('punctuation in the query is ignored', titles('dune part two')[0], 'Dune: Part Two');
    check('a leading article is not required', titles('brutalist')[0], 'The Brutalist');
    check('a mid-word match still ranks', titles('brutal').includes('Brutal Honesty'), true);
    check('a title that starts with the query outranks one that contains it', titles('brutal')[0], 'Brutal Honesty');
    check('a single character is too vague to search', titles('d').length, 0);
    check('no match returns nothing', titles('zzzznope').length, 0);
    check('the limit is respected', titles('a', 2).length <= 2, true);
    check('results carry the year', searchIndex(rows, 'Dune')[0].year, 2021);
    check('and whether we saw it', searchIndex(rows, 'A Real Pain')[0].seen, false);
  });
}
