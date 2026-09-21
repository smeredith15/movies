import { check, suite } from './harness.mjs';
import {
  ENTRY_TYPE_IDS,
  allowsFreeText,
  expandsCast,
  isEntryType,
  movieRequirement,
  validateEntry,
} from '../shared/entryTypes.js';

export default function run() {
  suite('entry types: what each kind needs', () => {
    check('all five kinds exist', ENTRY_TYPE_IDS.join(','), 'movie,person,character,movieText,free');
    check('an unknown kind is rejected', isEntryType('nonsense'), false);
    check('a movie entry needs a movie', movieRequirement('movie'), 'required');
    check('so does a movie-plus-text entry', movieRequirement('movieText'), 'required');
    check('a named acting category is one performance', movieRequirement('person'), 'required');
    check('cast expands for people', expandsCast('person'), true);
    check('and for characters', expandsCast('character'), true);
    check('but not for plain movies', expandsCast('movie'), false);
    check('movieText takes typed input', allowsFreeText('movieText'), true);
    check('plain movie does not', allowsFreeText('movie'), false);
  });

  suite('entry types: custom categories are looser', () => {
    const custom = { custom: true };
    check('an actor in a custom category may span movies', movieRequirement('person', custom), 'optional');
    check('so may a character', movieRequirement('character', custom), 'optional');
    check('but a movie category still needs one', movieRequirement('movie', custom), 'required');
    check('the free type skips the movie list entirely', movieRequirement('free', custom), 'none');
    check('even for a named category', movieRequirement('free'), 'none');
    check('and it takes typed input', allowsFreeText('free'), true);
  });

  suite('entry types: validating what was entered', () => {
    const movieCat = { type: 'movie' };
    const freeCat = { type: 'free', custom: true };
    const personCat = { type: 'person', custom: true };
    const sceneCat = { type: 'movieText' };

    check('a movie entry with a movie is fine', validateEntry({ movieId: 'dune-2021' }, movieCat).ok, true);
    check('a movie entry without one is not', validateEntry({}, movieCat).ok, false);
    check('a write-in counts as naming a movie', validateEntry({ writeIn: 'Some Obscure Thing' }, movieCat).ok, true);

    check('free text with something typed is fine', validateEntry({ text: 'Best trailer' }, freeCat).ok, true);
    check('free text with nothing typed is not', validateEntry({ text: '  ' }, freeCat).ok, false);
    check('free text refuses a movie', validateEntry({ text: 'x', movieId: 'dune-2021' }, freeCat).ok, false);

    check('a custom actor needs no movie', validateEntry({ person: 'Someone' }, personCat).ok, true);
    check('but still needs a name', validateEntry({}, personCat).ok, false);

    check('a scene needs both a movie and a description', validateEntry({ movieId: 'dune-2021', text: 'the ornithopter' }, sceneCat).ok, true);
    check('a scene without the description fails', validateEntry({ movieId: 'dune-2021' }, sceneCat).ok, false);
    check('and it says why', validateEntry({ movieId: 'dune-2021' }, sceneCat).reason, 'Say what it is.');

    check('an entry may override its category type', validateEntry({ type: 'free', text: 'anything' }, movieCat).ok, true);
  });
}
