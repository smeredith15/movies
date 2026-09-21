#!/usr/bin/env node
/**
 * Diagnostic probe for the release-schedule sources. Writes nothing to data/.
 *
 * The scrapers have never run against the live pages, so this reports what is
 * actually there before anything depends on it: the page structure, what the
 * parser extracted, the parenthetical qualifiers beside each title, and any
 * duplicates. Full dumps go to probe-output/ for the workflow to upload.
 *
 *   node scripts/probe-sources.mjs --year 2026
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { firstShowingUrl, WIKIPEDIA_LISTS, netflixCandidates, isRerelease } from './sources.mjs';
import { parseFirstShowing, parseWikipediaTables, toLines, titleKey } from './parse.mjs';
import { parse as parseHtml } from 'node-html-parser';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'probe-output');
const UA = 'movies-catalog/1.0 (personal watchlist tool)';

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
const YEAR = Number(args.year) || new Date().getUTCFullYear();

const h1 = (t) => console.log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);
const h2 = (t) => console.log(`\n--- ${t} ---`);

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
  return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : '' };
}

async function probeFirstShowing(year) {
  const url = firstShowingUrl(year);
  h1(`firstshowing.net — ${year}`);
  console.log(url);

  const { ok, status, body } = await fetchText(url);
  console.log(`HTTP ${status}, ${body.length.toLocaleString()} bytes`);
  if (!ok) {
    console.log('Could not fetch — nothing else to report.');
    return;
  }

  await writeFile(resolve(OUT, `firstshowing-${year}.html`), body);

  // Which container the parser picks, and what else was on offer.
  const doc = parseHtml(body);
  h2('page structure');
  for (const sel of ['.post', '#content', 'article', 'main', '.entry-content', '.page']) {
    const el = doc.querySelector(sel);
    console.log(`  ${sel.padEnd(16)} ${el ? `found, ${el.text.length.toLocaleString()} chars of text` : 'absent'}`);
  }

  const container =
    doc.querySelector('.post') || doc.querySelector('#content') || doc.querySelector('article') ||
    doc.querySelector('main') || doc;
  const lines = toLines(container);
  console.log(`  chosen container yields ${lines.length.toLocaleString()} text lines`);
  await writeFile(resolve(OUT, `firstshowing-${year}-lines.txt`), lines.join('\n'));

  h2('first 40 lines as the parser sees them');
  for (const line of lines.slice(0, 40)) console.log(`  | ${line.slice(0, 110)}`);

  const rows = parseFirstShowing(body, year);
  h2(`parser output: ${rows.length} entries`);
  await writeFile(resolve(OUT, `firstshowing-${year}-parsed.json`), JSON.stringify(rows, null, 2));

  if (rows.length === 0) {
    console.log('  NOTHING PARSED. The line dump above is the thing to look at.');
    return;
  }

  console.log('  date       | title                                    | raw line');
  for (const r of rows.slice(0, 30)) {
    console.log(`  ${r.date} | ${r.title.slice(0, 40).padEnd(40)} | ${r.context.slice(0, 60)}`);
  }

  // The qualifiers in brackets are the thing we need help reading.
  h2('parenthetical qualifiers, by frequency');
  const quals = new Map();
  for (const r of rows) {
    for (const m of r.context.matchAll(/\(([^)]{1,60})\)/g)) {
      const key = m[1].trim().toLowerCase();
      quals.set(key, (quals.get(key) ?? 0) + 1);
    }
  }
  const sorted = [...quals.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  ${sorted.length} distinct qualifiers across ${rows.length} entries`);
  for (const [q, n] of sorted.slice(0, 40)) console.log(`  ${String(n).padStart(4)}x  (${q})`);
  await writeFile(resolve(OUT, `firstshowing-${year}-qualifiers.json`), JSON.stringify(sorted, null, 2));

  h2('duplicate titles');
  const byKey = new Map();
  for (const r of rows) {
    const k = titleKey(r.title);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  const dupes = [...byKey.values()].filter((v) => v.length > 1);
  console.log(`  ${dupes.length} titles appear more than once`);
  for (const group of dupes.slice(0, 20)) {
    console.log(`  · ${group[0].title}`);
    for (const r of group) console.log(`      ${r.date}  ${r.context.slice(0, 70)}`);
  }
  await writeFile(
    resolve(OUT, `firstshowing-${year}-duplicates.json`),
    JSON.stringify(dupes.map((g) => g.map((r) => ({ date: r.date, title: r.title, context: r.context }))), null, 2)
  );

  h2('flagged as re-release or event by the current heuristic');
  const flagged = rows.filter((r) => isRerelease(r.title, r.context));
  console.log(`  ${flagged.length} of ${rows.length}`);
  for (const r of flagged.slice(0, 25)) console.log(`  · ${r.date}  ${r.context.slice(0, 80)}`);

  h2('sanity');
  const months = new Set(rows.map((r) => r.date.slice(0, 7)));
  console.log(`  ${months.size} distinct months covered: ${[...months].sort().join(' ')}`);
  const perMonth = {};
  for (const r of rows) perMonth[r.date.slice(0, 7)] = (perMonth[r.date.slice(0, 7)] ?? 0) + 1;
  console.log(`  entries per month: ${JSON.stringify(perMonth)}`);
}

async function probeWikipedia(year) {
  h1(`Wikipedia streaming lists — ${year}`);
  const report = [];

  for (const list of WIKIPEDIA_LISTS) {
    const candidates = list.templated ? netflixCandidates(year) : [list.page];
    let found = null;

    for (const page of candidates) {
      const url =
        `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&redirects=1` +
        `&page=${encodeURIComponent(page)}`;
      const { ok, body } = await fetchText(url);
      if (!ok) continue;
      try {
        const json = JSON.parse(body);
        if (json.error) continue;
        found = { page, html: json.parse?.text?.['*'] ?? '' };
        break;
      } catch {
        /* try the next candidate */
      }
    }

    h2(list.service);
    if (!found) {
      console.log(`  NOT FOUND. Tried: ${candidates.join(', ')}`);
      report.push({ service: list.service, found: false, tried: candidates });
      continue;
    }

    console.log(`  page: ${found.page}`);
    const doc = parseHtml(found.html);
    const tables = doc.querySelectorAll('table.wikitable');
    console.log(`  ${tables.length} wikitable(s)`);

    tables.slice(0, 8).forEach((t, i) => {
      const headers = t.querySelectorAll('tr')[0]?.querySelectorAll('th,td')
        .map((c) => c.text.replace(/\s+/g, ' ').trim()) ?? [];
      console.log(`    table ${i}: ${t.querySelectorAll('tr').length - 1} rows | headers: ${headers.join(' | ').slice(0, 110)}`);
    });

    const rows = parseWikipediaTables(found.html, {
      service: list.service,
      year,
      section: list.section ?? null,
    });
    const inYear = rows.filter((r) => r.date.startsWith(String(year)));
    console.log(`  parsed ${rows.length} dated rows, ${inYear.length} in ${year}`);
    for (const r of inYear.slice(0, 6)) console.log(`    ${r.date}  ${r.title}`);
    if (rows.length === 0 && tables.length > 0) {
      console.log('  ! tables present but nothing parsed — headers probably do not match');
    }

    report.push({ service: list.service, found: true, page: found.page, tables: tables.length, parsed: rows.length, inYear: inYear.length });
    await writeFile(resolve(OUT, `wikipedia-${list.service.replace(/\W+/g, '-')}.json`), JSON.stringify(rows, null, 2));
  }

  await writeFile(resolve(OUT, 'wikipedia-summary.json'), JSON.stringify(report, null, 2));

  h2('summary');
  for (const r of report) {
    console.log(`  ${r.service.padEnd(12)} ${r.found ? `${String(r.inYear).padStart(4)} in ${year}` : 'NOT FOUND'}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`Probing release sources for ${YEAR}. Nothing is written to data/.`);
  await probeFirstShowing(YEAR);
  await probeWikipedia(YEAR);
  console.log(`\nFull dumps in probe-output/ — download the workflow artifact to read them.`);
}

main().catch((err) => {
  console.error('\nProbe failed:', err.stack || err.message);
  process.exit(1);
});
