// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tsRoot = resolve(__dirname, '..');
const repoRoot = resolve(tsRoot, '..');

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const sinceIndex = args.indexOf('--since');
const sinceRef = sinceIndex !== -1 ? args[sinceIndex + 1] : 'origin/main';

function getChangedTsFiles(since) {
  let output = '';
  try {
    output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', since], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
  } catch {
    try {
      output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD~1'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      });
    } catch {
      output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      });
    }
  }

  const files = output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => (f.startsWith('ts/') ? f.slice(3) : f))
    .filter((f) => f.startsWith('src/') && f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .filter((f) => existsSync(resolve(tsRoot, f)));

  return [...new Set(files)];
}

let mutateArg = null;
if (!isAll) {
  const explicitFiles = args.filter((arg) => !arg.startsWith('--') && (sinceIndex === -1 || arg !== args[sinceIndex + 1]));
  const changedFiles = explicitFiles.length > 0 ? explicitFiles : getChangedTsFiles(sinceRef);

  if (changedFiles.length === 0) {
    console.log('No changed TypeScript source files detected in ts/src/. Skipping mutation testing.');
    process.exit(0);
  }

  mutateArg = changedFiles.join(',');
  console.log(`Running mutation testing on changed files: ${mutateArg}`);
} else {
  console.log('Running mutation testing on all TypeScript source files.');
}

const strykerArgs = ['stryker', 'run'];
if (mutateArg) {
  strykerArgs.push('--mutate', mutateArg);
}

const result = spawnSync('npx', strykerArgs, {
  cwd: tsRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
