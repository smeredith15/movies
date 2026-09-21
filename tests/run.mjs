#!/usr/bin/env node
/**
 * Runs every suite. `turns.ts` is TypeScript, so it is compiled to a throwaway
 * directory first rather than duplicating the logic in JavaScript.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { report } from './harness.mjs';
import runEligibility from './eligibility.test.mjs';
import runParse from './parse.test.mjs';
import runTurns from './turns.test.mjs';
import runIndex from './index.test.mjs';
import runCategories from './categories.test.mjs';
import runEntryTypes from './entryTypes.test.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = resolve(ROOT, '.test-build');

rmSync(BUILD, { recursive: true, force: true });
execFileSync(
  'npx',
  [
    'tsc',
    'src/lib/turns.ts',
    'src/lib/catalogIndex.ts',
    '--rootDir', 'src',
    '--outDir', BUILD,
    // CommonJS, because the source uses extensionless imports that Node's ESM
    // resolver rejects but its CJS resolver handles natively.
    '--module', 'commonjs',
    '--target', 'es2022',
    '--moduleResolution', 'node',
    '--skipLibCheck',
  ],
  { cwd: ROOT, stdio: 'inherit' }
);

// The project is "type": "module", so mark the throwaway build as CommonJS.
writeFileSync(resolve(BUILD, 'package.json'), '{"type":"commonjs"}');

const require = createRequire(import.meta.url);
const turns = require(resolve(BUILD, 'lib/turns.js'));
const catalogIndex = require(resolve(BUILD, 'lib/catalogIndex.js'));

runEligibility();
runParse();
runTurns(turns);
runIndex(catalogIndex);
runCategories();
runEntryTypes();

rmSync(BUILD, { recursive: true, force: true });
process.exit(report() === 0 ? 0 : 1);
