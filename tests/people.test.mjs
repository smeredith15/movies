import { check, suite } from './harness.mjs';

export default function run({ pickerLabel, isAttributed }) {
  const config = { people: { me: 'Scotty', her: 'Shelby' } };

  suite('people: how a picker reads', () => {
    check('a named person', pickerLabel('me', config), 'Scotty');
    check('the other one', pickerLabel('her', config), 'Shelby');
    check('a joint choice', pickerLabel('joint', config), 'Both of us');
    check('and one we cannot attribute', pickerLabel('unknown', config), 'Picker unknown');
    check('never a blank or an undefined lookup', pickerLabel('unknown', config).length > 0, true);
  });

  suite('people: whose turn a viewing can use', () => {
    check('mine can', isAttributed('me'), true);
    check('hers can', isAttributed('her'), true);
    check('a joint one cannot', isAttributed('joint'), false);
    check('and an unattributed one cannot', isAttributed('unknown'), false);
  });
}
