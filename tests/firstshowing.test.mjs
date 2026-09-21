import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, suite } from './harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = readFileSync(resolve(ROOT, 'tests/fixtures/firstshowing-sample.html'), 'utf8');

export default function run({ parseFirstShowing, classifyQualifier }) {
  suite('firstshowing: reading the qualifiers', () => {
    const q = (s) => classifyQualifier(s);

    check('(Theaters) is a theatrical release', q('Theaters').theatrical, true);
    check('(Expands) marks a widening', q('Expands').expands, true);
    check('(VOD) is a home release', q('VOD').home, true);
    check('(Theaters + VOD) is both at once', `${q('Theaters + VOD').theatrical}/${q('Theaters + VOD').home}`, 'true/true');
    check('a service name means streaming', q('Netflix').services[0], 'Netflix');
    check('and counts as a home release', q('Netflix').home, true);
    check('Paramount+ survives its plus sign', q('Paramount+').services[0], 'Paramount+');
    check('(Re-Release) is a revival', q('Re-Release').revival, true);
    check('so is Fathom', q('Fathom').revival, true);
    check('and an IMAX re-release', q('IMAX Re-Release').revival, true);

    // A format note says how a film is shown, not whether it opened.
    check('IMAX Only is still a theatrical release', q('IMAX Only').theatrical, true);
    check('as is Dolby Cinema Only', q('Dolby Cinema Only').theatrical, true);
    check('and + IMAX', q('+ IMAX').theatrical, true);
    check('but none of them is a home release', q('IMAX Only').home, false);

    check('a weekday is not a release at all', q('Friday').weekday, true);
    check('a limited engagement is still theatrical', q('until February 1').theatrical, true);
    check('and records when it ends', q('until February 1').engagementEnds, 'february 1');
    check('an empty qualifier claims nothing', q('').theatrical, false);
    check('and neither does a missing one', q(undefined).home, false);
  });

  suite('firstshowing: reading the real page', () => {
    const rows = parseFirstShowing(SAMPLE, 2026);
    const find = (t) => rows.filter((r) => r.title === t);

    check('every film in the sample is found', rows.length, 28);
    check('no weekday markers leak through as titles', rows.filter((r) => /^\(?(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/i.test(r.title)).length, 0);
    check('dates come from the headings', rows[0].date, '2026-01-02');
    check('and advance with them', rows.at(-1).date, '2026-01-16');

    // The legend: bold is nationwide, everything else is limited or streaming.
    check('a bold title is a nationwide opening', find('Greenland 2: Migration')[0].wide, true);
    check('a plain one is not', find('Dead Man’s Wire')[0]?.wide ?? find("Dead Man's Wire")[0].wide, false);

    check('streaming debuts carry their service', find('The Rip')[0].services[0], 'Netflix');
    check('and are home releases', find('The Rip')[0].home, true);
    check('a re-release is flagged', find('Labyrinth')[0].revival, true);
    check('poster art comes along for free', rows.filter((r) => r.poster).length > 20, true);
  });

  suite('firstshowing: the limited-then-wide pattern', () => {
    const rows = parseFirstShowing(SAMPLE, 2026);
    const wire = rows.filter((r) => r.title.includes('Dead Man'));

    check('the same film appears twice', wire.length, 2);
    check('first as a limited run', `${wire[0].date} wide=${wire[0].wide}`, '2026-01-09 wide=false');
    check('then as a nationwide expansion', `${wire[1].date} wide=${wire[1].wide}`, '2026-01-16 wide=true');
    check('marked as expanding', wire[1].expands, true);
    check('which is what rule 4 needs to tell the year', wire[0].date < wire[1].date, true);
  });
}
