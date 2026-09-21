import { check, suite } from './harness.mjs';

export default function run({ matchRank, normalizeTitle, rankTitles }, { indexCoverage } = {}) {
  const get = (r) => ({ title: r[1], year: r[2] });

  suite('title search: how well a title matches', () => {
    check('an exact match is best', matchRank('Dune', 'dune'), 0);
    check('a title starting with the query is next', matchRank('Dune: Part Two', 'dune'), 1);
    check('then a word inside it', matchRank('Children of Dune', 'dune'), 2);
    check('then anywhere at all', matchRank('Dunes', 'dune'), 1);
    check('no match is null', matchRank('Casablanca', 'dune'), null);
    check('punctuation is ignored', matchRank('Spider-Man: No Way Home', 'spider man'), 1);
    check('accents fold', matchRank('Amélie', 'amelie'), 0);
    check('case is ignored', normalizeTitle('THE Wild ROBOT'), 'the wild robot');
  });

  suite('title search: ranking a list', () => {
    const rows = [
      [1, 'Dune', 1984],
      [2, 'Dune', 2021],
      [3, 'Dune: Part Two', 2024],
      [4, 'Children of Dune', 2003],
      [5, 'Casablanca', 1942],
    ];
    const titles = (q, n) => rankTitles(rows, q, get).slice(0, n).map((r) => `${r.item[1]} (${r.item[2]})`);

    check('exact titles come first', titles('dune')[0].startsWith('Dune ('), true);
    check('newer breaks the tie between identical titles', titles('dune')[0], 'Dune (2021)');
    check('a shorter title wins when the query covers more of it', rankTitles([[1,'The Godfather',1972],[2,'The Godfather Part II',1974]], 'godfather', get)[0].item[1], 'The Godfather');
    check('even though the other is newer', rankTitles([[1,'The Godfather',1972],[2,'The Godfather Part II',1974]], 'godfather part', get)[0].item[1], 'The Godfather Part II');
    check('a prefix match outranks a mid-title one', titles('dune').indexOf('Dune: Part Two (2024)') < titles('dune').indexOf('Children of Dune (2003)'), true);
    check('non-matches are excluded', titles('dune').includes('Casablanca (1942)'), false);
    check('one character is too vague', rankTitles(rows, 'd', get).length, 0);
    check('an empty query matches nothing', rankTitles(rows, '', get).length, 0);
    check('a boost can override recency', rankTitles(rows, 'dune', get, (r) => (r[2] === 1984 ? -500 : 0))[0].item[2], 1984);
  });

  if (indexCoverage) {
    suite('tmdb index: describing what it covers', () => {
      const rows = [[1, 'Dune', 2021], [2, 'Casablanca', 1942], [3, 'Clueless', 1995]];
      check('it counts the titles', indexCoverage(rows).count, 3);
      check('and finds the earliest year', indexCoverage(rows).from, 1942);
      check('an empty index reports nothing', indexCoverage([]).count, 0);
      check('with no year to quote', indexCoverage([]).from, null);
    });
  }
}
