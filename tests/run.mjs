#!/usr/bin/env node
/**
 * Runs every suite. `turns.ts` is TypeScript, so it is compiled to a throwaway
 * directory first rather than duplicating the logic in JavaScript.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { report } from './harness.mjs';
import runEligibility from './eligibility.test.mjs';
import runParse from './parse.test.mjs';
import runTurns from './turns.test.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = resolve(ROOT, '.test-build');

rmSync(BUILD, { recursive: true, force: true });
execFileSync(
  'npx',
  ['tsc', 'src/lib/turns.ts', '--outDir', BUILD, '--module', 'es2022', '--target', 'es2022', '--moduleResolution', 'node', '--skipLibCheck'],
  { cwd: ROOT, stdio: 'inherit' }
);

const turns = await import(pathToFileURL(resolve(BUILD, 'turns.js')).href);

runEligibility();
runParse();
runTurns(turns);

rmSync(BUILD, { recursive: true, force: true });
process.exit(report() === 0 ? 0 : 1);
