#!/usr/bin/env node
/**
 * Build a searchable index of TMDB titles for the "add a movie" box.
 *
 * The page cannot call TMDB directly: a repository secret is readable by
 * Actions only, and anything a static page can read is public. So the search
 * corpus is built here, committed, and searched offline in the browser.
 *
 * The index is deliberately a subset — TMDB has roughly a million titles, most
 * of which are noise. Films are taken year by year, most-voted first, which
 * keeps anything a person might actually have watched and drops the rest.
 *
 *   node scripts/build-search-index.mjs --from 1950 --min-votes 50
 */
import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Tmdb } from './tmdb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data', 'tmdb-index.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[m[1]] = argv[++i];
    else out[m[1]] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const FROM = Number(args.from) || 1950;
const TO = Number(args.to) || new Date().getUTCFullYear();
const MIN_VOTES = Number(args['min-votes'] ?? 50);
const MAX_PAGES = Number(args['max-pages'] ?? 8);
const DRY = Boolean(args['dry-run']);

/** One year of films, most-voted first. */
async function yearSlice(tmdb, year) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tmdb.get('/discover/movie', {
      primary_release_year: year,
      'vote_count.gte': MIN_VOTES,
      sort_by: 'vote_count.desc',
      include_adult: false,
      page,
    });
    const results = data?.results ?? [];
    for (const r of results) {
      if (!r.title || !r.release_date) continue;
      rows.push([r.id, r.title, Number(r.release_date.slice(0, 4))]);
    }
    // Stop early rather than paging through empty results.
    if (results.length === 0 || page >= (data?.total_pages ?? 1)) break;
  }
  return rows;
}

async function main() {
  const key = process.env.TMDB_API;
  if (!key) {
    console.error('TMDB_API is not set. This runs in the Action, where the secret is available.');
    process.exit(1);
  }

  const tmdb = new Tmdb(key, { pauseMs: 25 });
  console.log(`Building search index for ${FROM}-${TO}, at least ${MIN_VOTES} votes\n`);

  const seen = new Set();
  const index = [];

  for (let year = TO; year >= FROM; year--) {
    const rows = await yearSlice(tmdb, year);
    let added = 0;
    for (const row of rows) {
      if (seen.has(row[0])) continue;
      seen.add(row[0]);
      index.push(row);
      added += 1;
    }
    if (added) console.log(`  ${year}: ${added}`);
  }

  index.sort((a, b) => (a[2] === b[2] ? a[1].localeCompare(b[1]) : b[2] - a[2]));

  const json = JSON.stringify(index);
  const mb = (json.length / 1024 / 1024).toFixed(2);
  console.log(`\n${index.length} titles, ${mb} MB raw (${tmdb.calls} API calls)`);

  // The browser downloads this only when the add-a-movie search is opened,
  // but it is still worth knowing when it gets fat.
  if (json.length > 4 * 1024 * 1024) {
    console.log('  ! over 4 MB — consider raising --min-votes or --from');
  }

  if (DRY) {
    console.log('\nDry run — nothing written.');
    return;
  }

  let previous = 0;
  try {
    previous = JSON.parse(await readFile(OUT, 'utf8')).length;
  } catch {
    /* first run */
  }

  await writeFile(OUT, `${json}\n`);
  console.log(`\nWrote ${OUT}${previous ? ` (was ${previous} titles)` : ''}`);
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
