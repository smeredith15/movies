#!/usr/bin/env node
/**
 * Preflight for the TMDB workflows. Fails early, and says exactly what to fix
 * rather than leaving an empty environment variable to be puzzled over.
 */
import { credentialKind } from './tmdb.mjs';

const value = process.env.TMDB_API ?? '';
const kind = credentialKind(value);

if (kind === 'missing') {
  console.error('TMDB_API is empty. GitHub masks real secrets as ***, so an empty');
  console.error('value means the secret did not resolve at all. Check, in order:');
  console.error('');
  console.error('  1. It is under Settings > Secrets and variables > Actions,');
  console.error('     in the "Repository secrets" tab — not Codespaces, not');
  console.error('     Dependabot, and not the "Variables" tab next to it.');
  console.error('  2. The name is exactly TMDB_API (names are case-sensitive).');
  console.error('  3. If it is an Environment secret, this job must declare that');
  console.error('     environment; it currently does not.');
  console.error('');
  console.error('Re-adding the secret is usually quicker than finding which of');
  console.error('these it is.');
  process.exit(1);
}

// The length is safe to print and tells us which credential we were handed.
console.log(`TMDB_API is set: ${value.trim().length} characters, read as ${kind}.`);

if (kind === 'unknown') {
  console.log('');
  console.log('That does not look like either TMDB credential. A v3 API key is 32');
  console.log('hex characters; a v4 read access token starts with "ey" and has two');
  console.log('dots. It will be tried as a v3 key. If TMDB answers 401, the value');
  console.log('is probably truncated or has stray whitespace.');
}
