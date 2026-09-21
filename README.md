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

Titles autocomplete against an index of every catalogued movie, so logging a
watch links it to that year's list. The **Backfill** tab takes many rows at
once and saves them as a single commit.

## History

The **History** tab is the imported watch list, grouped by release year. Two
sources feed it:

- `data/seen.json` — every movie the workbook marked as watched (729 of them,
  about 40 KB, so the page never pulls the 4.8 MB of full catalogs). The
  workbook had no date or picker columns, so these arrive as rows *waiting to
  be dated*.
- `data/watches.json` — anything logged through the app, with the full record.

Setting anything on an imported row — a date, who picked it, where we watched
it — turns it into a real watch linked to that catalog entry. A row saves as
soon as any field is touched; a date is not required. A pick recorded without
one still counts as watched and shows in the history, it just sits out of the
rotation until a date arrives, and the Tracker says how many are waiting. Edits stage up
locally and save together in one commit, so dating a year's worth of movies is
one commit rather than sixty.

Because that is a long session, staged edits are written to `localStorage` on
every keystroke and restored on the way back in. Switching tabs, reloading, or
hitting back no longer costs you the work, and the tab label carries the
unsaved count so it is visible from anywhere in the app. The save bar is
anchored to the bottom of the window rather than the top, since the rows being
filled in are usually at the foot of a long page. Watches typed by hand that matched no catalog
entry get their own section rather than being silently filed under a year.

**Add a movie** covers anything the workbook never listed. It searches TMDB by
title and adds what you pick, recording the TMDB id; a title the index does not
cover can still be typed by hand.

The search runs against `data/tmdb-index.json`, built by the Action and
committed to the repo. The page cannot query TMDB itself — the API key is a
repository secret, and anything a static page can read is public — so the
corpus is built where the key is safe and searched offline in the browser. It
is fetched on first use rather than at startup, since it is only needed when
adding a movie.

Rebuild it from the **Build movie search index** action. The index takes films
year by year, most-voted first, which keeps anything a person plausibly watched
and drops the long tail.

Three inputs control it:

| input | default | effect |
| --- | --- | --- |
| `from_year` | 1920 | earliest release year included |
| `min_votes` | 50 | the real size lever — raise it to shrink the index |
| `max_pages` | 100 | safety cap per year, 20 films a page |

`max_pages` should not normally bind; `min_votes` is what should do the
limiting. When a year does hit the cap the run says so and names the years, so
a silently truncated index is not something you have to notice yourself — an
earlier default of 8 pages quietly made the whole index a top-160-per-year
list.

Either way the entry lands in `data/added.json` — a small file, rather than
appending to a 300 KB year catalog — and the app merges it into the watched
list. The importer folds those entries into the catalogs on its next run,
marked `manual`, so they survive later re-imports.

## Correcting a pick

The Tracker lists the most recent picks with the two corrections that actually
come up: **who picked it**, and **whether it used a turn**. Getting one of
those wrong is the usual reason the rotation drifts, and fixing it there
re-derives the turn immediately — no adjustment needed to paper over it.
Switching a pick to "Both" frees the turn automatically, since joint picks
never consume one.

Use an adjustment for something that genuinely happened off-rotation — a bet, a
deal, a forfeited pick. Use an override here when the record is simply wrong.

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

| type | what you pick | needs a movie |
| --- | --- | --- |
| `movie` | a movie from the eligible pool | yes |
| `person` | an actor — the movie rows expand to show cast | yes, unless custom |
| `character` | a character — the movie rows expand to show roles | yes, unless custom |
| `movieText` | a movie, then type the answer, prompted by `textLabel` | yes |
| `free` | nothing from any list — just type it | no |

The rules for each type live in `shared/entryTypes.js`, including
`validateEntry`, which is what decides whether a filled-in slot is usable.

Best Animal is `movieText` rather than `character` because cast lists rarely
name the animals, so free text is the only thing that reliably works. Best
Scene, Biggest Twist and Best Original Song work the same way. Every category
also accepts a write-in.

One category, Most Thought We'd See—But Didn't, draws from the movies we did
*not* see (`pool: unwatched`).

### Ballot shape

Every category has the same structure: **one winner and up to four honorable
mentions**, unranked and optional. That never varies — what varies is whether
those slots are worth anything.

### Scoring

Point values differ by category on purpose. Favorite pays 5 for the winner and
3 per honorable mention; Saddest and Scariest pay 2 for the winner and nothing
for mentions; Strangest Role pays 1. Six categories — Least Favorite, Least
Favorite Character, Most Thought I'd Like More, Most Overrated, Probably Didn't
Get It, and Most Thought We'd See—But Didn't — score nothing at all. All of
them still offer the full five slots and still appear in the reveal.

That asymmetry is deliberate, not a gap in the data. The points feed a rewatch
day, so a category worth more would pull the day toward its genre — the reason
Saddest pays nothing for mentions is that we didn't want to flood the pool with
sad movies.

### The five custom categories

The unnamed rows at the bottom of the `Awards` sheet are the categories we each
invent on the day. They are stored as five slots (`custom-1` … `custom-5`) with
empty names, marked `nameEditable`, `typeEditable` and `perPerson`: the name,
the type and the picks are all chosen at voting time and saved on that person's
ballot rather than in the shared list, so you each make up your own without
seeing the other's. Each pays 1 for the winner.

All five types are available to them, and two rules are relaxed because a
made-up category does not behave like a fixed one:

- An actor or character in a custom category only *optionally* names a movie,
  since these are often about someone's whole year rather than one performance.
- The `free` type bypasses the movie list altogether — no eligible-movie pool,
  no cast expansion, just a typed answer. That is the escape hatch for a
  category that is not about any particular movie.

## Reading the release schedule

firstshowing.net carries the wide/limited distinction in its **markup**, not
its text. Its own legend says:

> Bold = Nationwide Release — (Non-Bold = Limited or Streaming)

Each film is an `<a class="showTip">`, wrapped in `<strong>` when it is a
nationwide opening, followed by a qualifier in `<em>` brackets:

```html
<h4>January 9</h4>
<p class="sched">
  <a ...><strong>All That's Left of You</strong></a> (<em>Expands</em>)<br />
  <a ...>Dead Man's Wire</a> (<em>Theaters</em>)<br />
```

Reading that page as flattened text loses both signals, which is exactly what
the eligibility rules depend on — so `scripts/firstshowing.mjs` parses the DOM.
The qualifiers, taken from a census of a full year:

| qualifier | meaning |
| --- | --- |
| *(none)*, bold | nationwide opening |
| *(Expands)* | widening from an earlier limited run — this is rule 4 |
| *(Theaters)* | limited theatrical |
| *(VOD)*, *(Theaters + VOD)* | home release, possibly alongside theaters |
| *(Netflix)*, *(Prime Video)*, *(Hulu)*, … | streaming debut on that service |
| *(Re-Release)*, *(IMAX Re-Release)*, *(Fathom)* | a revival, excluded |
| *(IMAX Only)*, *(Dolby Cinema Only)*, *(+ IMAX)* | format only — still theatrical |
| *(until February 1)* | limited engagement, still theatrical |
| *(Friday)*, *(Wednesday)* | weekday marker, not a film |

Poster art comes along for free in each link's `data-url`.

Run **Probe release sources** after either site changes layout. It reports
structure, the qualifier census and duplicates, and writes nothing to `data/`.

## Rebuilding the catalog

On demand, never on a schedule:

```bash
npm run refresh-catalog -- --year 2026            # writes data/catalog/2026.json
npm run refresh-catalog -- --year 2026 --dry-run  # report only
```

or press **Refresh** in the app, which dispatches the same script as a GitHub
Action. Sources are firstshowing.net for theatrical dates and the Wikipedia
streaming lists for everything else; both are defined in `scripts/sources.mjs`.

### TMDB

`TMDB_API` is a repository secret, read by the Action and **never shipped to
the browser** — anything the static page can read is public, so a secret cannot
reach it.

Add it under **Settings → Secrets and variables → Actions**, in the
*Repository secrets* tab. Not Codespaces, not Dependabot, and not the
*Variables* tab beside it — none of those reach `secrets.TMDB_API`. Either
credential works: a v3 API key (32 hex characters, sent as a query parameter)
or a v4 read access token (a JWT, sent as a bearer header). The workflows
detect which one they were handed.

Both TMDB workflows run `scripts/check-tmdb-secret.mjs` first, which fails with
the list of things to check rather than leaving an empty variable behind.

TMDB supplies what the scrapers cannot: US release dates *by type*, plus cast
and characters. That typing is the whole game — a schedule page says a title
appeared on some date, while TMDB says whether that was a festival premiere, a
limited run, a wide run or a home release, which is exactly the distinction the
eligibility rules turn on. TMDB dates therefore take precedence over scraped
ones, and the rules are re-run afterwards; anything that changes year is
reported rather than silently moved.

The cast it returns is also what the ballot's actor and character categories
need.

Two modes:

```bash
npm run refresh-catalog -- --year 2026 --enrich-only   # dates and cast only
npm run refresh-catalog -- --year 2026                 # also re-scrape
```

`--enrich-only` matters most right now: entries imported from the workbook have
no release dates at all, so the rules engine cannot judge their year until TMDB
fills them in.

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
