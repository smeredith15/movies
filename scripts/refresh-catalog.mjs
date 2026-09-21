#!/usr/bin/env node
/**
 * Rebuild the eligible-movie catalog for one film year.
 *
 * Reads firstshowing.net for US theatrical dates and the Wikipedia streaming
 * lists for everything that went straight to a service, applies the house
 * eligibility rules, and writes data/catalog/<year>.json.
 *
 * Manual entries and stored overrides are never clobbered: overrides live in
 * data/overrides.json and are applied by the app at read time, so re-running
 * this is always safe.
 *
 *   node scripts/refresh-catalog.mjs --year 2026 [--dry-run] [--debug]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeEligibility } from '../shared/eligibility.js';
import { firstShowingUrl, WIKIPEDIA_LISTS, netflixCandidates, isRerelease } from './sources.mjs';
import { parseFirstShowing, parseWikipediaTables, titleKey, slugify } from './parse.mjs';
import { Tmdb, usReleaseDates, castFrom, factsFrom } from './tmdb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'movies-catalog/1.0 (personal watchlist tool)';

/** Accepts both `--year=2026` and `--year 2026`. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) {
      out[m[1]] = m[2];
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[m[1]] = argv[++i];
    } else {
      out[m[1]] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const parsedYear = Number.parseInt(args.year, 10);
const YEAR = Number.isInteger(parsedYear) && parsedYear > 1900 ? parsedYear : new Date().getUTCFullYear();
const DRY = Boolean(args['dry-run']);
const DEBUG = Boolean(args.debug);

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  !', ...a);

async function fetchText(url, { optional = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
      if (res.ok) return await res.text();
      if (res.status === 404 && optional) return null;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === 2) {
        if (optional) {
          warn(`gave up on ${url}: ${err.message}`);
          return null;
        }
        throw new Error(`Failed to fetch ${url}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  return null;
}

/** Wikipedia through the parse API, which is far more stable than the rendered page. */
async function fetchWikipedia(page) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&redirects=1` +
    `&page=${encodeURIComponent(page)}`;
  const raw = await fetchText(url, { optional: true });
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (json.error) return null;
    return json.parse?.text?.['*'] ?? null;
  } catch {
    return null;
  }
}

async function collectTheatrical(year) {
  const rows = [];
  // The previous year's page matters: a late-December limited run that expands
  // in January is still eligible for the earlier year under rule 4.
  for (const y of [year - 1, year]) {
    const html = await fetchText(firstShowingUrl(y), { optional: true });
    if (!html) {
      warn(`no schedule page for ${y}`);
      continue;
    }
    const parsed = parseFirstShowing(html, y);
    log(`  firstshowing ${y}: ${parsed.length} listings`);
    if (parsed.length < 50) {
      warn(`only ${parsed.length} listings from ${y} — the page layout may have changed`);
      if (DEBUG) console.log(parsed.slice(0, 10));
    }
    rows.push(...parsed);
  }
  return rows;
}

async function collectStreaming(year) {
  const rows = [];
  for (const list of WIKIPEDIA_LISTS) {
    let html = null;
    let used = list.page;

    if (list.templated) {
      for (const candidate of netflixCandidates(year)) {
        html = await fetchWikipedia(candidate);
        if (html) {
          used = candidate;
          break;
        }
      }
    } else {
      html = await fetchWikipedia(list.page);
    }

    if (!html) {
      warn(`could not read ${list.service} list (${used})`);
      continue;
    }
    const parsed = parseWikipediaTables(html, { service: list.service, year });
    const inYear = parsed.filter((r) => r.date.startsWith(String(year)));
    log(`  ${list.service}: ${inYear.length} of ${parsed.length} rows in ${year}`);
    rows.push(...inYear);
  }
  return rows;
}

/** Fold every source row for one movie into a single record. */
function mergeRows(theatrical, streaming) {
  const byKey = new Map();

  const upsert = (title, patch, source) => {
    const key = titleKey(title);
    if (!key) return null;
    const cur = byKey.get(key) || { title, sources: new Set(), services: new Set() };
    // Prefer the longest title seen — sources abbreviate inconsistently.
    if (title.length > cur.title.length) cur.title = title;
    Object.assign(cur, patch(cur));
    cur.sources.add(source);
    byKey.set(key, cur);
    return cur;
  };

  for (const row of theatrical) {
    if (isRerelease(row.title, row.context)) {
      upsert(row.title, () => ({ kind: 'rerelease' }), firstShowingUrl(row.date.slice(0, 4)));
      continue;
    }
    upsert(
      row.title,
      (cur) => {
        const patch = { kind: cur.kind === 'rerelease' ? 'rerelease' : 'theatrical', hadUSTheatricalRelease: true };
        if (row.limited) {
          patch.usLimitedDate = !cur.usLimitedDate || row.date < cur.usLimitedDate ? row.date : cur.usLimitedDate;
        } else {
          patch.usTheatricalDate =
            !cur.usTheatricalDate || row.date < cur.usTheatricalDate ? row.date : cur.usTheatricalDate;
        }
        return patch;
      },
      firstShowingUrl(row.date.slice(0, 4))
    );
  }

  for (const row of streaming) {
    const rec = upsert(
      row.title,
      (cur) => ({
        kind: cur.kind || 'streaming',
        homeDate: !cur.homeDate || row.date < cur.homeDate ? row.date : cur.homeDate,
        isDocumentary: cur.isDocumentary || row.isDocumentary,
        isForeignLanguage: cur.isForeignLanguage || row.isForeignLanguage,
      }),
      `https://en.wikipedia.org/wiki/List_of_${row.service.replace(/\s+/g, '_')}_original_films`
    );
    if (rec) rec.services.add(row.service);
  }

  return byKey;
}

/**
 * Fill in what the scrapers cannot know: real US release dates by type, cast,
 * and whether a film is foreign-language or a documentary.
 *
 * TMDB dates take precedence over the scraped ones. A schedule page tells us a
 * title appeared on some date; TMDB tells us whether that was a festival
 * premiere, a limited run, a wide run or a home release — which is exactly the
 * distinction the eligibility rules turn on.
 */
async function enrich(movies, apiKey, { force = false } = {}) {
  if (!apiKey) {
    warn('no TMDB_API set — skipping release dates, cast and ratings');
    return { matched: 0, missed: [] };
  }

  const tmdb = new Tmdb(apiKey);
  let matched = 0;
  const missed = [];

  for (const m of movies) {
    if (!force && m.tmdbId) continue;

    const hit = await tmdb.findBest(m.title, m.computedYear ?? undefined);
    if (!hit) {
      missed.push(m.title);
      continue;
    }

    const details = await tmdb.details(hit.id);
    if (!details) {
      missed.push(m.title);
      continue;
    }

    const dates = usReleaseDates(details);
    const facts = factsFrom(details);

    // Only overwrite a date TMDB actually knows.
    for (const key of ['festivalDate', 'usLimitedDate', 'usTheatricalDate', 'homeDate']) {
      if (dates[key]) m[key] = dates[key];
    }

    m.tmdbId = facts.tmdbId;
    m.imdbId = facts.imdbId ?? m.imdbId;
    m.isDocumentary = m.isDocumentary || facts.isDocumentary;
    m.isForeignLanguage = m.isForeignLanguage || facts.isForeignLanguage;
    m.hadUSTheatricalRelease =
      m.hadUSTheatricalRelease || Boolean(dates.usTheatricalDate || dates.usLimitedDate);

    const cast = castFrom(details);
    if (cast.length) m.cast = cast;

    matched += 1;
  }

  log(`  matched ${matched} of ${movies.length} on TMDB (${tmdb.calls} API calls)`);
  if (missed.length) {
    log(`  ${missed.length} not found: ${missed.slice(0, 8).join(', ')}${missed.length > 8 ? '…' : ''}`);
  }
  return { matched, missed };
}

/**
 * Re-run the rules now that TMDB has supplied real dates. Entries imported
 * from the workbook arrive with no dates at all, so this is what lets the
 * engine actually decide their year instead of trusting the sheet.
 */
function recompute(movies, year) {
  let changed = 0;
  for (const m of movies) {
    if (!m.tmdbId) continue; // nothing new to go on
    const verdict = computeEligibility(m);
    if (verdict.year === null) continue;
    if (verdict.year !== m.computedYear) changed += 1;
    m.computedYear = verdict.year;
    m.confidence = verdict.confidence;
    m.evidence = verdict.evidence;
  }
  if (changed) {
    log(`  ${changed} title(s) moved year once TMDB supplied real dates`);
    const moved = movies.filter((m) => m.computedYear !== year);
    if (moved.length) {
      log(`  ${moved.length} no longer belong to ${year} — review before removing:`);
      for (const m of moved.slice(0, 10)) log(`    · ${m.title} → ${m.computedYear}`);
    }
  }
  return changed;
}

async function main() {
  const outPath = resolve(ROOT, 'data', 'catalog', `${YEAR}.json`);

  if (args['enrich-only']) {
    log(`Enriching the existing ${YEAR} catalog from TMDB\n`);
    const catalog = JSON.parse(await readFile(outPath, 'utf8'));
    await enrich(catalog, process.env.TMDB_API, { force: Boolean(args.force) });
    recompute(catalog, YEAR);
    if (DRY) {
      log('\nDry run — nothing written.');
      return;
    }
    await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
    log(`\nWrote ${outPath}`);
    return;
  }

  log(`Rebuilding catalog for ${YEAR}\n`);

  log('Theatrical releases:');
  const theatrical = await collectTheatrical(YEAR);

  log('\nStreaming releases:');
  const streaming = await collectStreaming(YEAR);

  log('\nMerging…');
  const merged = mergeRows(theatrical, streaming);
  log(`  ${merged.size} distinct titles across all sources`);

  let existing = [];
  try {
    existing = JSON.parse(await readFile(outPath, 'utf8'));
  } catch {
    /* first run */
  }
  const existingById = new Map(existing.map((m) => [m.id, m]));

  const catalog = [];
  const counts = { high: 0, medium: 0, low: 0, dropped: 0 };

  for (const rec of merged.values()) {
    const shape = {
      title: rec.title,
      kind: rec.kind || 'theatrical',
      festivalDate: rec.festivalDate ?? null,
      usLimitedDate: rec.usLimitedDate ?? null,
      usTheatricalDate: rec.usTheatricalDate ?? null,
      homeDate: rec.homeDate ?? null,
      isForeignLanguage: Boolean(rec.isForeignLanguage),
      isDocumentary: Boolean(rec.isDocumentary),
      hadUSTheatricalRelease: Boolean(rec.hadUSTheatricalRelease),
    };

    const verdict = computeEligibility(shape);
    if (verdict.year !== YEAR) {
      counts.dropped += 1;
      continue;
    }

    const id = slugify(rec.title, YEAR);
    const prior = existingById.get(id);

    catalog.push({
      id,
      ...shape,
      services: [...(rec.services || [])],
      oscarNominated: prior?.oscarNominated ?? false,
      ratings: prior?.ratings ?? {},
      cast: prior?.cast ?? [],
      imdbId: prior?.imdbId ?? null,
      tmdbId: prior?.tmdbId ?? null,
      sources: [...rec.sources],
      computedYear: verdict.year,
      confidence: verdict.confidence,
      evidence: verdict.evidence,
      manual: false,
    });
    counts[verdict.confidence] += 1;
  }

  // Anything added by hand in the app stays, even if no source lists it.
  for (const m of existing) {
    if (m.manual && !catalog.some((c) => c.id === m.id)) catalog.push(m);
  }

  catalog.sort((a, b) => a.title.localeCompare(b.title));

  log('\nEnriching from TMDB:');
  await enrich(catalog, process.env.TMDB_API);
  recompute(catalog, YEAR);

  log('\nResult:');
  log(`  ${catalog.length} movies eligible for ${YEAR}`);
  log(`  confidence — high ${counts.high}, medium ${counts.medium}, low ${counts.low}`);
  log(`  ${counts.dropped} titles resolved to a different year or were re-releases`);

  const lowConfidence = catalog.filter((m) => m.confidence !== 'high');
  if (lowConfidence.length) {
    log(`\n  ${lowConfidence.length} need a look in the app's review queue:`);
    for (const m of lowConfidence.slice(0, 15)) log(`    · ${m.title} — ${m.evidence[0]}`);
    if (lowConfidence.length > 15) log(`    … and ${lowConfidence.length - 15} more`);
  }

  if (DRY) {
    log('\nDry run — nothing written.');
    return;
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error('\nRefresh failed:', err.message);
  process.exit(1);
});
