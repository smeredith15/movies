/**
 * Parser for the firstshowing.net release schedule.
 *
 * The page carries the wide/limited distinction in its markup, not its text —
 * its own legend says "Bold = Nationwide Release (Non-Bold = Limited or
 * Streaming)". Each film is an <a class="showTip">, bold when it is a
 * nationwide opening, followed by a qualifier in <em> brackets:
 *
 *   <h4>January 9</h4>
 *   <p class="sched">
 *     <a ...><strong>All That's Left of You</strong></a> (<em>Expands</em>)<br />
 *     <a ...>Dead Man's Wire</a> (<em>Theaters</em>)<br />
 *
 * Reading this as flattened text loses both signals, which is exactly what the
 * eligibility rules depend on.
 */
import { parse } from 'node-html-parser';
import { parseDate } from './parse.mjs';

/** Streaming services that appear as a qualifier. */
const SERVICES = new Map(
  Object.entries({
    netflix: 'Netflix',
    'prime video': 'Prime Video',
    prime: 'Prime Video',
    'apple tv': 'Apple TV+',
    'apple tv+': 'Apple TV+',
    hulu: 'Hulu',
    'hbo max': 'HBO Max',
    max: 'HBO Max',
    'paramount+': 'Paramount+',
    peacock: 'Peacock',
    'disney+': 'Disney+',
    shudder: 'Shudder',
    mubi: 'MUBI',
  })
);

/** Qualifiers meaning this is a revival, not a new release. */
const REVIVAL = /re-?release|fathom|anniversary|remaster|restoration|live in 3d|in concert|encore/i;

/** Qualifiers that describe the format only and carry no release meaning. */
const FORMAT_ONLY = /^\+?\s*(imax|dolby cinema|3d|70mm|35mm)\b|only$/i;

const WEEKDAY = /^(mon|tues|wednes|thurs|fri|satur|sun)day\b/i;

/**
 * What a qualifier tells us. Several can apply at once — "(Theaters + VOD)"
 * is both a theatrical and a home release on the same day.
 */
export function classifyQualifier(raw) {
  const q = String(raw ?? '').trim().toLowerCase();
  const out = {
    expands: false,
    theatrical: false,
    home: false,
    revival: false,
    services: [],
    engagementEnds: null,
    formatOnly: false,
    weekday: false,
  };
  if (!q) return out;

  if (WEEKDAY.test(q)) {
    out.weekday = true;
    return out;
  }
  if (REVIVAL.test(q)) {
    out.revival = true;
    return out;
  }

  // "(until February 1)" — a limited engagement window, still a release.
  const until = q.match(/^until\s+(.+)$/);
  if (until) {
    out.engagementEnds = until[1];
    out.theatrical = true;
    return out;
  }

  if (/\bexpands?\b/.test(q)) out.expands = true;
  if (/\btheaters?\b/.test(q)) out.theatrical = true;
  if (/\bvod\b|\bdigital\b/.test(q)) out.home = true;

  for (const [needle, name] of SERVICES) {
    // A trailing \b cannot anchor after "+", so require a non-word boundary
    // on each side instead of a word one.
    const escaped = needle.replace(/[+]/g, '\\+');
    if (new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9+])`).test(q)) {
      out.services.push(name);
      out.home = true;
    }
  }

  // "IMAX Only", "Dolby Cinema Only", "+ IMAX" describe how a film is shown in
  // theaters, so they are a theatrical release, not an absence of one.
  if (!out.expands && !out.home && FORMAT_ONLY.test(q)) {
    out.formatOnly = true;
    out.theatrical = true;
  }
  return out;
}

/** Split a node list into groups separated by <br>. */
function splitAtBreaks(nodes) {
  const groups = [[]];
  for (const node of nodes) {
    if ((node.rawTagName || '').toLowerCase() === 'br') groups.push([]);
    else groups[groups.length - 1].push(node);
  }
  return groups.filter((g) => g.length > 0);
}

const textOf = (nodes) =>
  nodes.map((n) => (n.text ?? n.rawText ?? '')).join('').replace(/\s+/g, ' ').trim();

export function parseFirstShowing(html, year) {
  const doc = parse(html);
  const rows = [];
  let currentDate = null;

  // Headings and schedule paragraphs, in document order.
  for (const el of doc.querySelectorAll('h1, h2, h3, h4, h5, p.sched')) {
    const tag = (el.rawTagName || '').toLowerCase();

    if (tag !== 'p') {
      const parsed = parseDate(el.text, year);
      if (parsed) currentDate = parsed;
      continue;
    }
    if (!currentDate) continue;

    for (const group of splitAtBreaks(el.childNodes)) {
      const anchor = group.find((n) => (n.rawTagName || '').toLowerCase() === 'a');
      if (!anchor) continue;

      const title = anchor.text.replace(/\s+/g, ' ').trim();
      if (!title) continue;

      // The legend: bold is a nationwide opening, everything else is limited
      // or streaming.
      const wide = Boolean(anchor.querySelector('strong, b'));

      // Qualifiers are the <em> bits after the link, before the next break.
      const after = group.slice(group.indexOf(anchor) + 1);
      const quals = after
        .flatMap((n) => (n.querySelectorAll ? n.querySelectorAll('em') : []))
        .concat(after.filter((n) => (n.rawTagName || '').toLowerCase() === 'em'))
        .map((n) => n.text.trim());

      // Fall back to bracketed text when the markup omits <em>.
      if (quals.length === 0) {
        for (const m of textOf(after).matchAll(/\(([^)]{1,60})\)/g)) quals.push(m[1].trim());
      }

      const flags = quals.map(classifyQualifier);
      const merged = {
        expands: flags.some((f) => f.expands),
        theatrical: flags.some((f) => f.theatrical),
        home: flags.some((f) => f.home),
        revival: flags.some((f) => f.revival),
        services: [...new Set(flags.flatMap((f) => f.services))],
        engagementEnds: flags.find((f) => f.engagementEnds)?.engagementEnds ?? null,
      };

      rows.push({
        title,
        date: currentDate,
        wide,
        ...merged,
        qualifiers: quals,
        poster: anchor.getAttribute('data-url') || null,
        href: anchor.getAttribute('href') || null,
        source: 'firstshowing',
      });
    }
  }

  return rows;
}
