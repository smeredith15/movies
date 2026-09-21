import { check, suite } from './harness.mjs';
import {
  isDateHeading,
  looksLikeTitle,
  parseDate,
  parseFirstShowing,
  parseWikipediaTables,
  slugify,
  titleKey,
} from '../scripts/parse.mjs';

export default function run() {
  suite('parsing: dates as these pages actually write them', () => {
    check('January 9, 2026', parseDate('January 9, 2026'), '2026-01-09');
    check('Friday, January 9th with a default year', parseDate('Friday, January 9th', 2026), '2026-01-09');
    check('9 January 2026', parseDate('9 January 2026'), '2026-01-09');
    check('already ISO', parseDate('2026-01-09'), '2026-01-09');
    check('a Wikipedia citation marker is ignored', parseDate('March 6, 2026[12]'), '2026-03-06');
    check('abbreviated months', parseDate('Sept. 18, 2026'), '2026-09-18');
    check('a title is not a date', parseDate('Some Movie Title'), null);
  });

  suite('parsing: telling headings from titles', () => {
    check('a weekday heading', isDateHeading('Friday, January 9th'), true);
    check('a bare date heading', isDateHeading('January 9'), true);
    check('a movie title is not a heading', isDateHeading('The Batman Part II'), false);
    check('a title passes', looksLikeTitle('The Batman Part II'), true);
    check('navigation chrome is rejected', looksLikeTitle('Read More'), false);
    check('prose is rejected', looksLikeTitle('This is a long sentence of prose that runs on well past any plausible movie title'), false);
  });

  suite('parsing: the firstshowing schedule', () => {
    const html = `<div class="post">
      <h3>Friday, January 9th</h3><p>The Big One (Universal)</p><p>Small Film (limited)</p>
      <h3>Friday, January 16th</h3><p>Another Movie</p></div>`;
    const rows = parseFirstShowing(html, 2026);
    check('every listing is found', rows.length, 3);
    check('title and date are paired', `${rows[0].title}@${rows[0].date}`, 'The Big One@2026-01-09');
    check('a limited run is flagged', rows[1].limited, true);
    check('the date advances at the next heading', rows[2].date, '2026-01-16');
  });

  suite('parsing: Wikipedia streaming tables', () => {
    const html = `<table class="wikitable">
      <tr><th>Release date</th><th>Title</th><th>Genre</th><th>Language</th></tr>
      <tr><td>January 9, 2026</td><td>Streamer Movie</td><td>Documentary</td><td>Spanish</td></tr>
      <tr><td>not a date</td><td>Skipped</td><td>Drama</td><td>English</td></tr></table>`;
    const rows = parseWikipediaTables(html, { service: 'Netflix', year: 2026 });
    check('rows without a date are skipped', rows.length, 1);
    check('documentaries are flagged', rows[0].isDocumentary, true);
    check('non-English is flagged', rows[0].isForeignLanguage, true);
  });

  suite('parsing: matching the same movie across sources', () => {
    check('a leading article is ignored', titleKey('The Batman'), titleKey('Batman'));
    check('punctuation is ignored', titleKey('Spider-Man: No Way Home'), titleKey('Spider Man No Way Home'));
    check('accents are folded', titleKey('Amélie'), titleKey('Amelie'));
    check('slugs carry the year', slugify('Avatar: Fire and Ash', 2026), 'avatar-fire-and-ash-2026');
  });
}
