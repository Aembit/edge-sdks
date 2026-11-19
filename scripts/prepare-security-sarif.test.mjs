// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  extractSarifFromDroidOutput,
  parseCliArgs,
  prepareSecuritySarif,
  validateSarifDocument,
} from './prepare-security-sarif.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, 'prepare-security-sarif.mjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-security-sarif-test-'));
}

function createBufferWriter() {
  let content = '';
  return {
    write(chunk) {
      content += String(chunk);
    },
    text() {
      return content;
    },
  };
}

function makeSampleSarif({ includeSchema = true, findings = [] } = {}) {
  const doc = {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'droid-deep-security-review',
            informationUri: 'https://factory.ai',
          },
        },
        results: findings,
      },
    ],
  };
  if (includeSchema) {
    doc.$schema = 'https://json.schemastore.org/sarif-2.1.0.json';
  }
  return doc;
}

describe('validateSarifDocument', () => {
  const invalidCases = [
    { name: 'null root', input: null },
    { name: 'array root', input: [] },
    { name: 'missing version', input: { runs: [] } },
    { name: 'wrong version', input: { version: '2.0.0', runs: [] } },
    { name: 'empty runs', input: { version: '2.1.0', runs: [] } },
    {
      name: 'multiple runs (only single run allowed)',
      input: {
        version: '2.1.0',
        runs: [
          { tool: { driver: { name: 'droid-deep-security-review' } }, results: [] },
          { tool: { driver: { name: 'droid-deep-security-review' } }, results: [] },
        ],
      },
    },
    {
      name: 'unexpected tool driver name',
      input: {
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'other-scanner' } }, results: [] }],
      },
    },
    {
      name: 'conflicting automationDetails.id',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            automationDetails: { id: 'custom-category/' },
            results: [],
          },
        ],
      },
    },
    {
      name: 'null automationDetails',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            automationDetails: null,
            results: [],
          },
        ],
      },
    },
    {
      name: 'missing tool driver name',
      input: {
        version: '2.1.0',
        runs: [{ tool: { driver: { name: '   ' } }, results: [] }],
      },
    },
    {
      name: 'non-array results',
      input: {
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'droid-deep-security-review' } }, results: null }],
      },
    },
    {
      name: 'invalid result level enum (high instead of error/warning/note/none)',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                level: 'high',
                locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'null result entry',
      input: {
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'droid-deep-security-review' } }, results: [null] }],
      },
    },
    {
      name: 'result missing ruleId',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'result missing required message',
      input: {
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'droid-deep-security-review' } }, results: [{ ruleId: 'SEC-1' }] }],
      },
    },
    {
      name: 'unknown property on result (additionalProperties=false) without leaking property name',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' }, region: { startLine: 1 } } }],
                SECRET_PROP_LEAK_XYZ: 'nope',
              },
            ],
          },
        ],
      },
      forbiddenPattern: /SECRET_PROP_LEAK_XYZ/,
    },
    {
      name: 'result without physicalLocation.artifactLocation.uri',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [{ ruleId: 'SEC-1', message: { text: 'Issue' } }],
          },
        ],
      },
    },
    {
      name: 'result where primary locations[0] lacks physicalLocation',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [
                  { logicalLocations: [{ name: 'fn' }] },
                  { physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' }, region: { startLine: 1 } } },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'artifactLocation.uri with unencoded spaces (invalid uri-reference)',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/bad file.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'artifactLocation.uri with invalid percent encoding (src/%ZZ.ts)',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'src/%ZZ.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'external https URI outside repository',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'https://example.com/outside.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'path traversal outside repository (../../outside.ts)',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: '../../outside.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'absolute filesystem path (/tmp/file.ts)',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: '/tmp/file.ts' }, region: { startLine: 1 } } }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'result missing region.startLine even when partialFingerprints is present',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' } } }],
                partialFingerprints: { primaryLocationLineHash: 'abc123:1' },
              },
            ],
          },
        ],
      },
    },
    {
      name: 'invalid partialFingerprints entry value without leaking dictionary key',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' }, region: { startLine: 10 } } }],
                partialFingerprints: { SECRET_DICT_KEY_XYZ: 123 },
              },
            ],
          },
        ],
      },
      forbiddenPattern: /SECRET_DICT_KEY_XYZ/,
    },
    {
      name: 'empty contextRegion object missing startLine/charOffset/byteOffset',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'ts/src/a.ts' },
                      region: { startLine: 1 },
                      contextRegion: {},
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      expectedReasonPattern: /anyOf schema constraint/,
    },
    {
      name: 'empty secondary location physicalLocation.region object',
      input: {
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'droid-deep-security-review' } },
            results: [
              {
                ruleId: 'SEC-1',
                message: { text: 'Issue' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'ts/src/a.ts' },
                      region: { startLine: 1 },
                    },
                  },
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'ts/src/b.ts' },
                      region: {},
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      expectedReasonPattern: /anyOf schema constraint/,
    },
  ];

  for (const testCase of invalidCases) {
    it(`rejects ${testCase.name}`, () => {
      const result = validateSarifDocument(testCase.input);
      assert.equal(result.valid, false);
      if (testCase.forbiddenPattern) {
        assert.doesNotMatch(result.reason, testCase.forbiddenPattern);
      }
      if (testCase.expectedReasonPattern) {
        assert.match(result.reason, testCase.expectedReasonPattern);
      }
    });
  }

  it('rejects deeply nested SARIF structures exceeding maximum schema validation depth', () => {
    let node = { id: 'leaf' };
    for (let i = 0; i < 25; i += 1) {
      node = { id: `n-${i}`, children: [node] };
    }
    const doc = makeSampleSarif({ findings: [] });
    doc.runs[0].graphs = [{ nodes: [node] }];

    const result = validateSarifDocument(doc);
    assert.equal(result.valid, false);
    assert.match(result.reason, /exceeds maximum schema validation depth/);
  });

  it('accepts valid regions using startLine, charOffset, or byteOffset and complex codeFlows', () => {
    const doc = makeSampleSarif({
      findings: [
        {
          ruleId: 'CWE-89',
          message: { text: 'Issue with codeFlow and valid regions' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'ts/src/a.ts' },
                region: { startLine: 10 },
                contextRegion: { charOffset: 120, charLength: 15 },
              },
            },
          ],
          codeFlows: [
            {
              threadFlows: [
                {
                  locations: [
                    {
                      location: {
                        physicalLocation: {
                          artifactLocation: { uri: 'ts/src/a.ts' },
                          region: { byteOffset: 42, byteLength: 8 },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = validateSarifDocument(doc);
    assert.equal(result.valid, true);
    assert.equal(result.totalFindings, 1);
  });

  it('defaults $schema when omitted and counts findings in single run', () => {
    const doc = {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'droid-deep-security-review' } },
          automationDetails: { id: 'droid-deep-security-review/weekly' },
          results: [
            {
              ruleId: 'CWE-89',
              message: { text: 'Issue 1' },
              locations: [{ physicalLocation: { artifactLocation: { uri: 'ts/src/a.ts' }, region: { startLine: 10 } } }],
            },
            {
              ruleId: 'CWE-79',
              message: { text: 'Issue 2' },
              locations: [{ physicalLocation: { artifactLocation: { uri: 'py/src/b.py' }, region: { startLine: 25 } } }],
              partialFingerprints: { primaryLocationLineHash: 'abc123:1' },
            },
          ],
        },
      ],
    };

    const result = validateSarifDocument(doc);
    assert.equal(result.valid, true);
    assert.equal(result.totalFindings, 2);
    assert.equal(result.runCount, 1);
    assert.equal(result.sarif.$schema, 'https://json.schemastore.org/sarif-2.1.0.json');
  });

  const dateTimeCases = [
    { label: 'impossible Feb 30 date', startTimeUtc: '2026-02-30T00:00:00Z', valid: false },
    { label: 'non-leap-year Feb 29 date', startTimeUtc: '2025-02-29T00:00:00Z', valid: false },
    { label: 'month 13 rollover', startTimeUtc: '2026-13-01T00:00:00Z', valid: false },
    { label: 'impossible Apr 31 date', startTimeUtc: '2026-04-31T12:00:00Z', valid: false },
    { label: 'hour 24 overflow', startTimeUtc: '2026-01-01T24:00:00Z', valid: false },
    { label: 'out-of-range timezone offset', startTimeUtc: '2026-01-01T12:00:00+25:00', valid: false },
    { label: 'valid leap day with fractional seconds and offset', startTimeUtc: '2024-02-29T23:59:59.123+02:00', valid: true },
    { label: 'valid UTC timestamp', startTimeUtc: '2026-11-19T12:00:00Z', valid: true },
  ];

  for (const testCase of dateTimeCases) {
    it(`${testCase.valid ? 'accepts' : 'rejects'} invocations[0].startTimeUtc for ${testCase.label}`, () => {
      const doc = makeSampleSarif({ findings: [] });
      doc.runs[0].invocations = [{ executionSuccessful: true, startTimeUtc: testCase.startTimeUtc }];

      const result = validateSarifDocument(doc);
      assert.equal(result.valid, testCase.valid);
      if (!testCase.valid) {
        assert.match(result.reason, /not a valid date-time/);
      }
    });
  }
});

describe('extractSarifFromDroidOutput', () => {
  it('extracts SARIF from fenced json block inside droid exec wrapper', () => {
    const sarif = makeSampleSarif({
      includeSchema: false,
      findings: [
        {
          ruleId: 'SEC-001',
          message: { text: 'SECRET_FINDING_TEXT_DO_NOT_LEAK' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'ts/src/secret-path.ts' },
                region: { startLine: 12 },
              },
            },
          ],
        },
      ],
    });

    const droidJson = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: `Audit completed.\n\`\`\`json\n${JSON.stringify(sarif, null, 2)}\n\`\`\`\nEnd of report.`,
    });

    const extracted = extractSarifFromDroidOutput(droidJson);
    assert.equal(extracted.ok, true);
    assert.equal(extracted.totalFindings, 1);
    assert.equal(extracted.runCount, 1);
    assert.equal(extracted.sarif.$schema, 'https://json.schemastore.org/sarif-2.1.0.json');
  });

  it('rejects droid output with is_error=true without leaking result payload', () => {
    const droidJson = JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'Sensitive exploit trace in ts/src/auth/token.ts with SECRET_TOKEN_123',
    });

    const extracted = extractSarifFromDroidOutput(droidJson);
    assert.equal(extracted.ok, false);
    assert.equal(extracted.isError, true);
    assert.match(extracted.reason, /is_error=true/);
    assert.doesNotMatch(extracted.reason, /SECRET_TOKEN_123|token\.ts/);
  });

  it('rejects NDJSON droid output when an error event follows a valid SARIF event', () => {
    const sarif = makeSampleSarif({ findings: [] });
    const ndjson = `${JSON.stringify(sarif)}\n${JSON.stringify({ type: 'result', is_error: true, result: 'ABORTED_SECRET_TRACE' })}`;

    const extracted = extractSarifFromDroidOutput(ndjson);
    assert.equal(extracted.ok, false);
    assert.equal(extracted.isError, true);
    assert.doesNotMatch(extracted.reason, /ABORTED_SECRET_TRACE/);
  });
});

describe('prepareSecuritySarif', () => {
  it('validates direct SARIF file with multiple findings and emits sanitized summary', () => {
    const tempDir = makeTempDir();
    try {
      const sarifInputPath = path.join(tempDir, 'security-review.sarif');
      const outputPath = path.join(tempDir, 'out', 'validated.sarif');
      const sensitiveText = 'SQL_INJECTION_DETAILS_XYZ';
      const sensitiveFile = 'py/src/aembit/vulnerable_handler.py';

      const sarif = makeSampleSarif({
        includeSchema: false,
        findings: [
          {
            ruleId: 'AEM-001',
            message: { text: sensitiveText },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: sensitiveFile },
                  region: { startLine: 42 },
                },
              },
            ],
          },
          {
            ruleId: 'AEM-002',
            message: { text: 'SECOND_SECRET_FINDING' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'ts/src/client.ts' },
                  region: { startLine: 7 },
                },
              },
            ],
          },
        ],
      });
      fs.writeFileSync(sarifInputPath, JSON.stringify(sarif), 'utf8');

      const stdout = createBufferWriter();
      const stderr = createBufferWriter();

      const res = prepareSecuritySarif({
        sarifInputPath,
        outputPath,
        stdout,
        stderr,
      });

      assert.equal(res.ok, true);
      assert.equal(res.totalFindings, 2);
      assert.equal(res.runCount, 1);
      assert.equal(stdout.text(), 'SARIF validated: 2 findings across 1 run(s)\n');
      assert.equal(stderr.text(), '');

      assert.doesNotMatch(stdout.text(), new RegExp(`${sensitiveText}|${sensitiveFile}|AEM-001|AEM-002`));
      assert.doesNotMatch(stderr.text(), new RegExp(`${sensitiveText}|${sensitiveFile}`));

      const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      assert.equal(written.$schema, 'https://json.schemastore.org/sarif-2.1.0.json');
      assert.equal(written.version, '2.1.0');
      assert.equal(written.runs[0].results.length, 2);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('succeeds when SARIF has 0 findings', () => {
    const tempDir = makeTempDir();
    try {
      const sarifInputPath = path.join(tempDir, 'empty.sarif');
      const outputPath = path.join(tempDir, 'validated.sarif');

      fs.writeFileSync(sarifInputPath, JSON.stringify(makeSampleSarif({ findings: [] })), 'utf8');

      const stdout = createBufferWriter();
      const stderr = createBufferWriter();

      const res = prepareSecuritySarif({
        sarifInputPath,
        outputPath,
        stdout,
        stderr,
      });

      assert.equal(res.ok, true);
      assert.equal(res.totalFindings, 0);
      assert.equal(stdout.text(), 'SARIF validated: 0 findings across 1 run(s)\n');
      assert.equal(stderr.text(), '');
      assert.equal(fs.existsSync(outputPath), true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('falls back to droid exec -o json wrapper when sarif-input is missing or invalid', () => {
    const tempDir = makeTempDir();
    try {
      const sarifInputPath = path.join(tempDir, 'broken.sarif');
      const logInputPath = path.join(tempDir, 'droid-exec.json');
      const outputPath = path.join(tempDir, 'validated.sarif');

      fs.writeFileSync(sarifInputPath, '{not-json', 'utf8');
      const sarif = makeSampleSarif({
        findings: [
          {
            ruleId: 'R-99',
            message: { text: 'CONFIDENTIAL_VULN_DESC' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'ts/src/auth.ts' },
                  region: { startLine: 15 },
                },
              },
            ],
          },
        ],
      });
      fs.writeFileSync(
        logInputPath,
        JSON.stringify({
          type: 'result',
          is_error: false,
          result: `Here is the SARIF report:\n\`\`\`json\n${JSON.stringify(sarif)}\n\`\`\``,
        }),
        'utf8'
      );

      const stdout = createBufferWriter();
      const stderr = createBufferWriter();

      const res = prepareSecuritySarif({
        sarifInputPath,
        logInputPath,
        outputPath,
        stdout,
        stderr,
      });

      assert.equal(res.ok, true);
      assert.equal(res.source, 'log-input');
      assert.equal(stdout.text(), 'SARIF validated: 1 findings across 1 run(s)\n');
      assert.equal(stderr.text(), '');
      assert.doesNotMatch(stdout.text(), /CONFIDENTIAL_VULN_DESC|R-99/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const errorCases = [
    {
      name: 'malformed SARIF and non-SARIF log',
      sarifContent: '{"version":"2.1.0","runs":[]}',
      logContent: '{"type":"result","is_error":false,"result":"RAW_SENSITIVE_TEXT_LEAK_CHECK"}',
      expectedError: 'Error: SARIF runs must contain exactly 1 run\n',
    },
    {
      name: 'droid is_error=true payload',
      sarifContent: null,
      logContent:
        '{"type":"result","subtype":"error_max_turns","num_turns":25,"duration_ms":1234,"is_error":true,"result":"EXPLOIT_PATH_ts/src/secret.ts_RAW_LEAK"}',
      expectedError:
        'Error: Unable to extract valid SARIF v2.1.0 report (droid is_error=true; subtype=error_max_turns, turns=25, duration_ms=1234)\n',
    },
    {
      name: 'droid is_error=true payload even when partial SARIF file exists',
      sarifContent: JSON.stringify(makeSampleSarif({ findings: [] })),
      logContent:
        '{"type":"result","is_error":true,"result":"PARTIAL_FAILURE_EXPLOIT_RAW_LEAK"}',
      expectedError: 'Error: Unable to extract valid SARIF v2.1.0 report (droid is_error=true)\n',
    },
    {
      name: 'mixed warning prefix followed by multiline droid is_error=true JSON',
      sarifContent: JSON.stringify(makeSampleSarif({ findings: [] })),
      logContent:
        'warning: startup\n{\n  "type": "result",\n  "is_error": true,\n  "result": "MULTILINE_EXPLOIT_RAW_LEAK"\n}',
      expectedError: 'Error: Unable to extract valid SARIF v2.1.0 report (droid is_error=true)\n',
    },
  ];

  for (const testCase of errorCases) {
    it(`fails cleanly without leaking raw text on ${testCase.name} and cleans up raw files`, () => {
      const tempDir = makeTempDir();
      try {
        const sarifInputPath = path.join(tempDir, 'security-review.sarif');
        const logInputPath = path.join(tempDir, 'droid-exec.json');
        const outputPath = path.join(tempDir, 'validated.sarif');

        if (testCase.sarifContent !== null) {
          fs.writeFileSync(sarifInputPath, testCase.sarifContent, 'utf8');
        }
        fs.writeFileSync(logInputPath, testCase.logContent, 'utf8');

        const stdout = createBufferWriter();
        const stderr = createBufferWriter();

        const res = prepareSecuritySarif({
          sarifInputPath,
          logInputPath,
          outputPath,
          cleanup: true,
          stdout,
          stderr,
        });

        assert.equal(res.ok, false);
        assert.equal(stdout.text(), '');
        assert.equal(stderr.text(), testCase.expectedError);
        assert.doesNotMatch(
          stderr.text(),
          /RAW_SENSITIVE_TEXT_LEAK_CHECK|EXPLOIT_PATH|MULTILINE_EXPLOIT_RAW_LEAK/
        );
        assert.equal(fs.existsSync(outputPath), false);
        assert.equal(fs.existsSync(sarifInputPath), false);
        assert.equal(fs.existsSync(logInputPath), false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }

  it('removes raw input files on success when cleanup is true, preserving output when distinct or identical', () => {
    const tempDir = makeTempDir();
    try {
      const sarifInputPath = path.join(tempDir, 'security-review.sarif');
      const logInputPath = path.join(tempDir, 'droid-exec.json');
      const outputPath = path.join(tempDir, 'validated.sarif');

      fs.writeFileSync(sarifInputPath, JSON.stringify(makeSampleSarif({ findings: [] })), 'utf8');
      fs.writeFileSync(logInputPath, '{"type":"result","result":"raw"}', 'utf8');

      const stdout = createBufferWriter();
      const stderr = createBufferWriter();

      const res = prepareSecuritySarif({
        sarifInputPath,
        logInputPath,
        outputPath,
        cleanup: true,
        stdout,
        stderr,
      });

      assert.equal(res.ok, true);
      assert.equal(fs.existsSync(outputPath), true);
      assert.equal(fs.existsSync(sarifInputPath), false);
      assert.equal(fs.existsSync(logInputPath), false);

      // Also verify sarifInputPath is NOT deleted if it equals outputPath
      fs.writeFileSync(outputPath, JSON.stringify(makeSampleSarif({ findings: [] })), 'utf8');
      fs.writeFileSync(logInputPath, '{"type":"result","result":"raw"}', 'utf8');
      const samePathRes = prepareSecuritySarif({
        sarifInputPath: outputPath,
        logInputPath,
        outputPath,
        cleanup: true,
        stdout: createBufferWriter(),
        stderr: createBufferWriter(),
      });
      assert.equal(samePathRes.ok, true);
      assert.equal(fs.existsSync(outputPath), true);
      assert.equal(fs.existsSync(logInputPath), false);

      // Also verify logInputPath is NOT deleted if it equals outputPath
      fs.writeFileSync(sarifInputPath, JSON.stringify(makeSampleSarif({ findings: [] })), 'utf8');
      fs.writeFileSync(outputPath, '{"type":"result","result":"raw"}', 'utf8');
      const sameLogPathRes = prepareSecuritySarif({
        sarifInputPath,
        logInputPath: outputPath,
        outputPath,
        cleanup: true,
        stdout: createBufferWriter(),
        stderr: createBufferWriter(),
      });
      assert.equal(sameLogPathRes.ok, true);
      assert.equal(fs.existsSync(outputPath), true);
      assert.equal(fs.existsSync(sarifInputPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('CLI integration', () => {
  it('supports CLI flags and env vars, returning exit code 0 on valid SARIF and 1 on invalid', () => {
    const tempDir = makeTempDir();
    try {
      const sarifInputPath = path.join(tempDir, 'in.sarif');
      const logInputPath = path.join(tempDir, 'droid.json');
      const outputPath = path.join(tempDir, 'out.sarif');

      fs.writeFileSync(
        sarifInputPath,
        JSON.stringify(
          makeSampleSarif({
            findings: [
              {
                ruleId: 'CLI-1',
                message: { text: 'SECRET_CLI_TEXT' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'ts/src/cli.ts' },
                      region: { startLine: 3 },
                    },
                  },
                ],
              },
            ],
          })
        ),
        'utf8'
      );
      fs.writeFileSync(logInputPath, '{"is_error":false}', 'utf8');

      const okOutput = execFileSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--sarif-input',
          sarifInputPath,
          '--log-input',
          logInputPath,
          '--output',
          outputPath,
          '--cleanup',
        ],
        { encoding: 'utf8' }
      );
      assert.equal(okOutput, 'SARIF validated: 1 findings across 1 run(s)\n');
      assert.equal(fs.existsSync(sarifInputPath), false);
      assert.equal(fs.existsSync(logInputPath), false);
      assert.equal(fs.existsSync(outputPath), true);

      // Failure path via env vars
      fs.writeFileSync(
        logInputPath,
        JSON.stringify({ is_error: true, result: 'DO_NOT_ECHO_THIS_EXPLOIT' }),
        'utf8'
      );
      const failRun = spawnSync(process.execPath, [SCRIPT_PATH, '--cleanup'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SARIF_INPUT_PATH: path.join(tempDir, 'missing.sarif'),
          DROID_LOG_PATH: logInputPath,
          SARIF_OUTPUT_PATH: outputPath,
        },
      });
      assert.equal(failRun.status, 1);
      assert.equal(failRun.stdout, '');
      assert.equal(
        failRun.stderr,
        'Error: Unable to extract valid SARIF v2.1.0 report (droid is_error=true)\n'
      );
      assert.doesNotMatch(failRun.stderr, /DO_NOT_ECHO_THIS_EXPLOIT/);
      assert.equal(fs.existsSync(logInputPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('parses flags and falls back to env vars via parseCliArgs', () => {
    const parsed = parseCliArgs(['--cleanup'], {
      SARIF_INPUT_PATH: '/tmp/a.sarif',
      DROID_LOG_PATH: '/tmp/b.json',
      SARIF_OUTPUT_PATH: '/tmp/out.sarif',
    });
    assert.deepEqual(parsed, {
      sarifInputPath: '/tmp/a.sarif',
      logInputPath: '/tmp/b.json',
      outputPath: '/tmp/out.sarif',
      cleanup: true,
      parseError: null,
    });
  });
});
