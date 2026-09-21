# Movie Nights

A two-person movie tracker and year-end ballot, deployed as a static site on
GitHub Pages with this repository itself as the database.

## How it is put together

There is no server. The page is a static build; every change it saves is a
commit to `data/` made through the GitHub Contents API with a token that lives
only in your browser. That means the full history of every edit is in `git log`,
and a bad change can be reverted like any other commit.

Because two people can be editing at once, writes use optimistic concurrency:
if the other person committed since you loaded the page, GitHub rejects the
stale write, the app re-reads their version, replays your change on top, and
retries. Records merge by id, so neither of you can clobber the other.

```
data/config.json        names, rotation size, Oscar dates, frozen years
data/watches.json       every movie watched, with who picked it and where
data/adjustments.json   bonus picks and skips, with an optional reason
data/overrides.json     manual eligibility-year decisions — these always win
data/catalog/<year>.json  the eligible-movie pool, rebuilt by the scraper
data/ballots/<year>.<person>.json   one file per person per year
```

## Whose turn is it

The turn indicator is never stored — it is derived by replaying the whole
history, so it cannot drift out of sync with what you logged.

The rotation is two picks each by default. What makes it survive real life is
that a pick is matched against the picker's *own* next entitlement rather than
against the front of the queue:

- **Theater trips** are decided together, so they default to joint and consume
  nobody's turn. Either default can be overridden per entry.
- **Backfilled history is exempt.** Set "Rotation live from" in Settings and
  picks before that date still count toward the queue and the totals, but are
  not flagged as out of turn — so keying in years of past watches does not
  litter the history with trade markers.
- **Trading** needs no special handling. Pick out of turn to catch something
  before it leaves theaters and the slot comes out of your next block — the
  other person keeps their place in the queue, and neither of you ends up ahead.
  The history marks the pick "out of turn".
- **Bets and deals** are an adjustment: an extra pick jumps the queue, a skip
  removes that person's next slot. Both take a free-text reason.

Titles autocomplete against a 290 KB index of all 5,408 catalogued movies, so
logging a watch links it to that year's list. The **Backfill** tab takes many
rows at once and saves them as a single commit.

## Which year a movie counts for

The rules live in `shared/eligibility.js`, which both the app and the scraper
import, so there is exactly one implementation:

1. **A festival premiere never sets the year.** Only a US release does.
2. **The year is when it was reasonably available to us at home** — the earlier
   of its expanded theatrical run or its home/streaming release.
3. **A late-December limited run still counts for that year** if it expanded or
   hit home before the Oscars that close the year. If it expanded after, it
   rolls forward.
4. **A season is ~15 months**, running 1 January through the following
   ceremony, but a movie is only ever on the ballot for the year it was
   released.
5. **Foreign-language films and documentaries must earn their place** — a US
   theatrical release, an Oscar nomination, or the fact that we watched it.

Every verdict carries a confidence level and the reasoning that produced it.
Anything below high confidence lands in a review queue. A manual override in
`data/overrides.json` always wins and survives every re-scrape, because the
scraper writes only to `data/catalog/` and never touches overrides.

## The award categories

`data/categories.json` holds all 25 categories, imported from the workbook's
`Awards` sheet. Each one records what it asks for and what it is worth:

| type | what you pick |
| --- | --- |
| `movie` | a movie from the eligible pool |
| `person` | an actor — the movie rows expand to show cast |
| `character` | a character — the movie rows expand to show roles |
| `movieText` | a movie, then type the answer, prompted by `textLabel` |

Best Animal is `movieText` rather than `character` because cast lists rarely
name the animals, so free text is the only thing that reliably works. Best
Scene, Biggest Twist and Best Original Song work the same way. Every category
also accepts a write-in.

One category, Most Thought We'd See—But Didn't, draws from the movies we did
*not* see (`pool: unwatched`).

### Scoring

A ballot is one winner plus up to four honorable mentions, unranked and
optional. Points differ by category on purpose: Favorite pays 5 and 3, while
Saddest and Scariest pay 2 for the winner and have no honorable mentions at
all, and Strangest Role pays 1.

That asymmetry is deliberate, not a gap in the data. The points feed a rewatch
day, so a category with more slots would pull the day toward its genre — the
reason Saddest is capped is that we didn't want to flood the pool with sad
movies.

Six categories carry no points at all — Least Favorite, Least Favorite
Character, Most Thought I'd Like More, Most Overrated, Probably Didn't Get It,
and Most Thought We'd See—But Didn't. They are still voted on and still show up
in the reveal; they just contribute nothing to the totals (`scored: false`).

## Rebuilding the catalog

On demand, never on a schedule:

```bash
npm run refresh-catalog -- --year 2026            # writes data/catalog/2026.json
npm run refresh-catalog -- --year 2026 --dry-run  # report only
```

or press **Refresh** in the app, which dispatches the same script as a GitHub
Action. Sources are firstshowing.net for theatrical dates and the Wikipedia
streaming lists for everything else; both are defined in `scripts/sources.mjs`.

Ratings come from OMDb if `OMDB_API_KEY` is set as a repository secret — it is
read by the Action, never shipped to the browser. OMDb provides IMDb,
Metacritic and the RT critic score. **There is no free source for the RT
audience score**, so that field stays manual.

## Setup

1. **Settings → Pages → Source: GitHub Actions.**
2. Create a fine-grained token at
   [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens/new),
   scoped to this repository, with **Contents: read & write** and
   **Actions: read & write**. Paste it into the app's Settings tab. Each of you
   does this once per device; it is stored in browser localStorage only.
3. Optionally add `OMDB_API_KEY` under Settings → Secrets → Actions.

```bash
npm install
npm run dev     # local development
npm test        # 71 assertions over the rules, the rotation and the parsers
npm run build
```

## The imported workbook

`scripts/import-workbook.py` is a one-time import of the original
`2023 movies.xlsx`. It produced `data/catalog/2011.json` through
`data/catalog/2025.json` — 5,408 titles, 685 of them marked seen — plus
`data/categories.json`, the 25 award categories and their scoring.

The workbook is a watchlist, not a pick log: it records *which* movies exist in
each release year and which ones we saw, but never *when* we saw them or *who
picked them*. Turn history therefore cannot be backfilled and starts fresh.
What is preserved is the per-year record of what we watched, which is what the
ballot needs.

`data/catalog/2024.json` also carries RT critic and audience scores recovered
from the `2024 Awards` sheet, and marks the 68 titles that were on that frozen
ballot. It is the only year with a frozen pool in the workbook.

Imported rows have no release dates, so the rules engine cannot re-derive their
year — the sheet they came from is the authority until a catalog refresh fills
the dates in. They are marked `confidence: medium` for that reason.

## Not built yet

- **The ballot UI.** Storage, eligibility, the catalog and the categories are
  all in place; the voting interface is not. See `src/components/Ballot.tsx`.
  See **The award categories** above for the agreed shape.
- **The rewatch day.** The point totals are meant to drive a rewatch day, which
  nothing builds yet. Once the ballot exists, this is the natural next piece:
  tally both ballots, apply the per-category weights, and produce the lineup.
- **Live parser validation.** The scrapers are unit-tested against fixtures but
  have never run against the live pages, because the machine they were written
  on had no outbound network. The first real run will report what it found and
  warn loudly if a layout has shifted.
