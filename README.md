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
- **Trading** needs no special handling. Pick out of turn to catch something
  before it leaves theaters and the slot comes out of your next block — the
  other person keeps their place in the queue, and neither of you ends up ahead.
  The history marks the pick "out of turn".
- **Bets and deals** are an adjustment: an extra pick jumps the queue, a skip
  removes that person's next slot. Both take a free-text reason.

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

## Not built yet

- **The ballot itself.** Storage, eligibility and the catalog are done; the
  categories are not, because the category list has not been supplied. See
  `src/components/Ballot.tsx`.
- **Historical backfill.** The watch history for prior years has not been
  imported.
- **Live parser validation.** The scrapers are unit-tested against fixtures but
  have never run against the live pages, because the machine they were written
  on had no outbound network. The first real run will report what it found and
  warn loudly if a layout has shifted.
