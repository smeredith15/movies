import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, suite } from './harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cats = JSON.parse(readFileSync(resolve(ROOT, 'data/categories.json'), 'utf8'));

export default function run() {
  suite('categories: the ballot has the shape we agreed', () => {
    check('every category from the sheet is present', cats.length, 30);
    check('twenty-five are named', cats.filter((c) => !c.custom).length, 25);
    check('five are day-of custom slots', cats.filter((c) => c.custom).length, 5);

    check(
      'every category offers one winner',
      cats.every((c) => c.slots.winner === 1),
      true
    );
    check(
      'and up to four honorable mentions, scored or not',
      cats.every((c) => c.slots.honorableMentions === 4),
      true
    );
    check(
      'scoring always lists four honorable-mention values',
      cats.every((c) => c.scoring.honorableMentions.length === 4),
      true
    );
    check('every category takes a write-in', cats.every((c) => c.allowWriteIn), true);
  });

  suite('categories: scoring varies but structure does not', () => {
    const by = (name) => cats.find((c) => c.name === name);
    check('Favorite pays 5 and 3', `${by('Favorite').scoring.winner}/${by('Favorite').scoring.honorableMentions[0]}`, '5/3');
    check('Saddest pays 2 and nothing for mentions', `${by('Saddest').scoring.winner}/${by('Saddest').scoring.honorableMentions[0]}`, '2/0');
    check('but Saddest still offers the mention slots', by('Saddest').slots.honorableMentions, 4);
    check('Strangest Role pays 1', by('Strangest Role for a Familiar Actor').scoring.winner, 1);
    check('six categories score nothing', cats.filter((c) => !c.scored).length, 6);
    check('an unscored category still has its slots', by('Most Overrated').slots.honorableMentions, 4);
  });

  suite('categories: the custom slots', () => {
    const custom = cats.filter((c) => c.custom);
    check('their names start empty', custom.every((c) => c.name === ''), true);
    check('their names are editable', custom.every((c) => c.nameEditable), true);
    check('and belong to whoever is voting', custom.every((c) => c.perPerson), true);
    check('each carries a placeholder', custom.every((c) => c.namePlaceholder), true);
    check('each pays 1 for the winner', custom.every((c) => c.scoring.winner === 1), true);
    check('ids are stable', custom.map((c) => c.id).join(','), 'custom-1,custom-2,custom-3,custom-4,custom-5');
  });

  suite('categories: entry types', () => {
    const valid = new Set(['movie', 'person', 'character', 'movieText']);
    check('every type is one we handle', cats.every((c) => valid.has(c.type)), true);
    check('movieText categories prompt their text field', cats.filter((c) => c.type === 'movieText').every((c) => c.textLabel), true);
    check('Best Animal takes free text', cats.find((c) => c.name === 'Best Animal').type, 'movieText');
    check('one category draws from what we did not see', cats.filter((c) => c.pool === 'unwatched').length, 1);
    check('ids are unique', new Set(cats.map((c) => c.id)).size, cats.length);
  });
}
