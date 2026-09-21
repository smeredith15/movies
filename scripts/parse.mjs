import { parse } from 'node-html-parser';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Parse the date formats these pages actually use. Returns ISO or null. */
export function parseDate(text, defaultYear) {
  if (!text) return null;
  const s = text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();

  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // "January 9, 2026" / "January 9th" / "Jan. 9"
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const year = m[3] ? Number(m[3]) : defaultYear;
    if (year) return iso(year, MONTHS[m[1].toLowerCase()], Number(m[2]));
  }

  // "9 January 2026"
  m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return iso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  }

  return null;
}

/** True when a line is nothing but a date header, e.g. "Friday, January 9th". */
export function isDateHeading(line) {
  const s = line.replace(/\s+/g, ' ').trim();
  if (s.length > 48) return false;
  return /^(mon|tues|wednes|thurs|fri|satur|sun)day,?\s+/i.test(s)
    ? true
    : /^[A-Za-z]{3,9}\.?\s+\d{1,2}(st|nd|rd|th)?\s*$/.test(s);
}

const NOISE = [
  /^(home|news|reviews|trailers|schedule|about|contact|archives|search)$/i,
  /^(share|tweet|comments?|read more|continue reading|advertisement)$/i,
  /^(follow us|subscribe|privacy|terms|copyright)/i,
  /^\d+\s*(comments?|replies)$/i,
  /^(posted|by|filed under|tags?):/i,
];

export function looksLikeTitle(line) {
  const s = line.trim();
  if (s.length < 2 || s.length > 110) return false;
  if (NOISE.some((re) => re.test(s))) return false;
  if (isDateHeading(s)) return false;
  if (/^https?:\/\//i.test(s)) return false;
  // A title line is mostly words, not a sentence of prose.
  if (s.split(/\s+/).length > 14) return false;
  return /[A-Za-z0-9]/.test(s);
}

/** Flatten an element to text lines, preserving block boundaries. */
export function toLines(root) {
  const BLOCK = new Set([
    'p','div','li','tr','h1','h2','h3','h4','h5','h6','br','section','article','ul','ol','table','strong','b',
  ]);
  const out = [];
  let buf = '';
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
    buf = '';
  };
  const walk = (node) => {
    if (node.nodeType === 3) {
      buf += node.rawText ? node.rawText.replace(/&nbsp;/g, ' ') : '';
      return;
    }
    const tag = (node.rawTagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'nav' || tag === 'footer') return;
    if (BLOCK.has(tag)) flush();
    for (const child of node.childNodes || []) walk(child);
    if (BLOCK.has(tag)) flush();
  };
  walk(root);
  flush();
  return out;
}

/**
 * firstshowing.net schedule pages are a long run of date headings followed by
 * the titles opening that day. We read them as text lines rather than guessing
 * at the markup, which survives their template changes.
 */
export function parseFirstShowing(html, year) {
  const doc = parse(html);
  const content =
    doc.querySelector('.post') ||
    doc.querySelector('#content') ||
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc;

  const lines = toLines(content);
  const found = [];
  let currentDate = null;

  for (const line of lines) {
    if (isDateHeading(line)) {
      const d = parseDate(line, year);
      if (d) {
        currentDate = d;
        continue;
      }
    }
    if (!currentDate) continue;

    // Titles often carry a trailing distributor or note in parentheses.
    const cleaned = line
      .replace(/\s*\((?:limited|wide|expands?|re-?release|imax|3d|nyc\/la|ny\/la)[^)]*\)\s*$/i, '')
      .trim();
    const context = line;
    if (!looksLikeTitle(cleaned)) continue;

    const limited = /\blimited\b|\bnyc?\/la\b|\bny\/la\b/i.test(context);
    found.push({
      title: cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim() || cleaned,
      date: currentDate,
      limited,
      context,
      source: 'firstshowing',
    });
  }

  return found;
}

/**
 * Pull rows out of the wikitables on a Wikipedia list page.
 *
 * `section` restricts reading to tables under a matching heading. Some pages
 * list a service's whole output — Peacock's covers series, specials and films
 * alike — and taking every table there drags television into a film catalog.
 */
export function parseWikipediaTables(html, { service, year, section = null }) {
  const doc = parse(html);
  const found = [];

  // Walk headings and tables in document order so each table knows what it
  // sits under.
  let heading = '';
  const nodes = doc.querySelectorAll('h1, h2, h3, h4, table.wikitable');
  const tables = [];
  for (const node of nodes) {
    const tag = (node.rawTagName || '').toLowerCase();
    if (tag !== 'table') {
      heading = node.text.replace(/\[edit\]/gi, '').replace(/\s+/g, ' ').trim();
      continue;
    }
    if (section && !section.test(heading)) continue;
    tables.push({ table: node, heading });
  }

  for (const { table } of tables) {
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) continue;

    const headers = rows[0]
      .querySelectorAll('th,td')
      .map((c) => c.text.replace(/\s+/g, ' ').trim().toLowerCase());

    const titleCol = headers.findIndex((h) => /\btitle\b|\bfilm\b|\bname\b/.test(h));
    const dateCol = headers.findIndex((h) => /release|premiere|\bdate\b/.test(h));
    const genreCol = headers.findIndex((h) => /genre|category/.test(h));
    const langCol = headers.findIndex((h) => /language/.test(h));
    if (titleCol === -1) continue;

    for (const row of rows.slice(1)) {
      const cells = row.querySelectorAll('th,td');
      if (cells.length === 0) continue;

      const title = cells[titleCol]?.text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 2) continue;

      const rawDate = dateCol >= 0 ? cells[dateCol]?.text : '';
      const date = parseDate(rawDate, year);
      if (!date) continue;

      const genre = genreCol >= 0 ? (cells[genreCol]?.text || '').toLowerCase() : '';
      const language = langCol >= 0 ? (cells[langCol]?.text || '').trim() : '';

      found.push({
        title,
        date,
        service,
        isDocumentary: /document/.test(genre),
        isForeignLanguage: Boolean(language) && !/english/i.test(language),
        source: 'wikipedia',
      });
    }
  }

  return found;
}

/** Normalized key for matching the same movie across sources. */
export function titleKey(title) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function slugify(title, year) {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return year ? `${base}-${year}` : base;
}
