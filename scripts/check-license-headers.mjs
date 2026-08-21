#!/usr/bin/env node
// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const isFix = process.argv.includes('--fix');

const HEADER_PATTERNS = {
  hash: {
    lines: [
      '# Copyright 2024-present Aembit, Inc.',
      '# SPDX-License-Identifier: Apache-2.0',
    ],
    extensions: ['.py', '.sh'],
  },
  slash: {
    lines: [
      '// Copyright 2024-present Aembit, Inc.',
      '// SPDX-License-Identifier: Apache-2.0',
    ],
    extensions: ['.ts', '.js', '.mjs'],
  },
};

const IGNORED_DIRS = new Set([
  '.git',
  '.github',
  '.venv',
  '.pkg-venv',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.pytest_cache',
  '__pycache__',
  '.gemini',
]);

const IGNORED_FILES = new Set([
  'azure-runtime-shims.d.ts',
]);

function getAllFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function getHeaderType(filePath) {
  const base = path.basename(filePath);
  if (IGNORED_FILES.has(base)) {
    return null;
  }
  const ext = path.extname(filePath);
  for (const [type, config] of Object.entries(HEADER_PATTERNS)) {
    if (config.extensions.includes(ext)) {
      return type;
    }
  }
  return null;
}

function checkAndProcessFile(filePath) {
  const headerType = getHeaderType(filePath);
  if (!headerType) {
    return { ok: true, skipped: true };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const expectedLines = HEADER_PATTERNS[headerType].lines;
  const expectedHeader = expectedLines.join('\n');

  let body = content;
  let shebang = '';

  if (content.startsWith('#!')) {
    const firstNewline = content.indexOf('\n');
    if (firstNewline !== -1) {
      shebang = content.slice(0, firstNewline + 1);
      body = content.slice(firstNewline + 1);
    } else {
      shebang = content;
      body = '';
    }
  }

  const hasHeader = body.startsWith(expectedHeader);

  if (hasHeader) {
    return { ok: true, filePath };
  }

  if (isFix) {
    let newBody = body;
    // Check if there's an outdated or partial copyright line to strip
    const lines = body.split('\n');
    let startIndex = 0;
    while (
      startIndex < lines.length &&
      (lines[startIndex].trim().startsWith('# Copyright') ||
        lines[startIndex].trim().startsWith('// Copyright') ||
        lines[startIndex].trim().startsWith('# SPDX-') ||
        lines[startIndex].trim().startsWith('// SPDX-') ||
        lines[startIndex].trim() === '')
    ) {
      startIndex++;
    }
    newBody = lines.slice(startIndex).join('\n');
    if (newBody.length > 0 && !newBody.startsWith('\n')) {
      newBody = '\n' + newBody;
    }
    const newContent = `${shebang}${expectedHeader}${newBody}`;
    fs.writeFileSync(filePath, newContent, 'utf8');
    return { ok: true, fixed: true, filePath };
  }

  return { ok: false, filePath };
}

function run() {
  const allFiles = getAllFiles(repoRoot);
  const missing = [];
  const fixed = [];
  let checkedCount = 0;

  for (const file of allFiles) {
    const result = checkAndProcessFile(file);
    if (!result.skipped) {
      checkedCount++;
      if (result.fixed) {
        fixed.push(path.relative(repoRoot, file));
      } else if (!result.ok) {
        missing.push(path.relative(repoRoot, file));
      }
    }
  }

  if (isFix) {
    console.log(`Checked ${checkedCount} files. Fixed ${fixed.length} files.`);
    if (fixed.length > 0) {
      console.log('Fixed headers in:');
      for (const f of fixed) {
        console.log(`  - ${f}`);
      }
    }
  } else {
    if (missing.length > 0) {
      console.error(`License header check failed for ${missing.length} file(s):`);
      for (const f of missing) {
        console.error(`  - ${f}`);
      }
      console.error('\nRun `npm run lint:headers:fix` to automatically insert missing headers.');
      process.exit(1);
    } else {
      console.log(`All ${checkedCount} source files have valid copyright headers.`);
    }
  }
}

run();
