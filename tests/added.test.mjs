import { check, suite } from './harness.mjs';

export default function run({ slugifyTitle }) {
  suite('added movies: ids match the catalog convention', () => {
    check('a plain title', slugifyTitle('The Wild Robot', 2024), 'the-wild-robot-2024');
    check('punctuation becomes separators', slugifyTitle('Spider-Man: No Way Home', 2021), 'spider-man-no-way-home-2021');
    check('accents fold to ascii', slugifyTitle('Amélie', 2001), 'amelie-2001');
    check('trailing punctuation does not leave a dangling dash', slugifyTitle('The Bride!', 2026), 'the-bride-2026');
    check('an ampersand is dropped cleanly', slugifyTitle('Deadpool & Wolverine', 2024), 'deadpool-wolverine-2024');
    check('surrounding whitespace is irrelevant', slugifyTitle('Anora', 2024), slugifyTitle('Anora', 2024));
    check('the same title in two years is two movies', slugifyTitle('Dune', 1984) === slugifyTitle('Dune', 2021), false);
  });
}
