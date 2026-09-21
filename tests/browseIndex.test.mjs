import { check, suite } from './harness.mjs';

export default function run({ toBrowseRow, toBrowseIndex, BROWSE_FIELDS }) {
  const movie = {
    id: 'dune-2021',
    title: 'Dune',
    kind: 'theatrical',
    usTheatricalDate: '2021-10-22',
    ratings: { imdb: 8.5 },
    seen: true,
    wantToSee: 9,
    confidence: 'high',
    evidence: ['Available in the US on 2021-10-22.'],
    // The bulk of a catalog, and none of it is browsed.
    cast: Array.from({ length: 20 }, (_, i) => ({ name: `Actor ${i}`, character: `Role ${i}` })),
    sources: ['https://example.com/a-long-source-url'],
    imdbId: 'tt1160419',
    tmdbId: 438631,
  };

  suite('browse index: keeps what browsing needs', () => {
    const row = toBrowseRow(movie);
    check('the title', row.title, 'Dune');
    check('the dates it is filtered by', row.usTheatricalDate, '2021-10-22');
    check('the scores shown when expanded', row.ratings.imdb, 8.5);
    check('whether we have seen it', row.seen, true);
    check('and how much we want to', row.wantToSee, 9);
    check('the confidence that drives the review filter', row.confidence, 'high');
    check('and the reasoning behind it', row.evidence.length, 1);
  });

  suite('browse index: drops what it does not', () => {
    const row = toBrowseRow(movie);
    check('cast is left behind', 'cast' in row, false);
    check('so are source urls', 'sources' in row, false);
    check('and the external ids', 'imdbId' in row, false);

    const full = JSON.stringify(movie).length;
    const lean = JSON.stringify(row).length;
    check('which is most of the bytes', lean < full / 2, true);
  });

  suite('browse index: it is a faithful projection', () => {
    check('a list maps one to one', toBrowseIndex([movie, movie]).length, 2);
    check('an empty catalog is an empty index', toBrowseIndex([]).length, 0);
    check('a field a movie lacks is simply absent', 'poster' in toBrowseRow({ id: 'x', title: 'X' }), false);
    check('no field is invented', Object.keys(toBrowseRow(movie)).every((k) => BROWSE_FIELDS.includes(k)), true);
    check('a false value is kept, not dropped', toBrowseRow({ id: 'x', seen: false }).seen, false);
    check('and so is a zero rating', toBrowseRow({ id: 'x', wantToSee: 0 }).wantToSee, 0);
  });
}
