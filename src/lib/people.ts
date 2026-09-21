import type { Config, Picker } from './types';

/** How a picker reads in the interface. */
export function pickerLabel(picker: Picker, config: Config): string {
  if (picker === 'joint') return 'Both of us';
  if (picker === 'unknown') return 'Picker unknown';
  return config.people[picker];
}

/** Whether this viewing can be charged to someone's turn. */
export const isAttributed = (picker: Picker): picker is 'me' | 'her' =>
  picker === 'me' || picker === 'her';
