#!/usr/bin/env node
// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const EXPECTED_DRIVER_NAME = 'droid-deep-security-review';
const EXPECTED_AUTOMATION_ID_PREFIX = 'droid-deep-security-review/';
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SARIF_SCHEMA_PATH = path.join(CURRENT_DIR, 'sarif-schema-2.1.0.json');
const SARIF_SCHEMA = JSON.parse(fs.readFileSync(SARIF_SCHEMA_PATH, 'utf8'));

function isRepositoryRelativeArtifactUri(uri) {
  if (typeof uri !== 'string' || uri.trim().length === 0) {
    return false;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith('/') || uri.startsWith('\\')) {
    return false;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return false;
  }
  if (decoded.startsWith('/') || decoded.startsWith('\\') || decoded.includes('\\')) {
    return false;
  }
  const normalized = path.posix.normalize(decoded);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    return false;
  }
  return true;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchemaRef(ref, rootSchema) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return null;
  }
  const parts = ref.slice(2).split('/');
  let current = rootSchema;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return null;
    }
    current = current[part];
  }
  return current;
}

function isValidGuidOrPattern(value, pattern) {
  return new RegExp(pattern).test(value);
}

const URI_REFERENCE_REGEX =
  /^(((([A-Za-z][+\-.0-9A-Za-z]*(:%[0-9A-Fa-f]{2}|:[!$&-.0-;=?-Z_a-z~]|[/?])|\?)(%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*|([A-Za-z][+\-.0-9A-Za-z]*:?)?)|([A-Za-z][+\-.0-9A-Za-z]*:)?\/((%[0-9A-Fa-f]{2}|\/((%[0-9A-Fa-f]{2}|[!$&-.0-9;=A-Z_a-z~])+|(\[(([Vv][0-9A-Fa-f]+\.[!$&-.0-;=A-Z_a-z~]+)?|[.0-:A-Fa-f]+)\])?)(:\d*)?[/?]|[!$&-.0-;=?-Z_a-z~])(%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*|(\/((%[0-9A-Fa-f]{2}|[!$&-.0-9;=A-Z_a-z~])+|(\[(([Vv][0-9A-Fa-f]+\.[!$&-.0-;=A-Z_a-z~]+)?|[.0-:A-Fa-f]+)\])?)(:\d*)?)?))#(%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*|(([A-Za-z][+\-.0-9A-Za-z]*)?%[0-9A-Fa-f]{2}|[!$&-.0-9;=@_~]|[A-Za-z][+\-.0-9A-Za-z]*[!$&-*,;=@_~])(%[0-9A-Fa-f]{2}|[!$&-.0-9;=@-Z_a-z~])*((([/?](%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*)?#|[/?])(%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*)?|([A-Za-z][+\-.0-9A-Za-z]*(:%[0-9A-Fa-f]{2}|:[!$&-.0-;=?-Z_a-z~]|[/?])|\?)(%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*|([A-Za-z][+\-.0-9A-Za-z]*:)?\/((%[0-9A-Fa-f]{2}|\/((%[0-9A-Fa-f]{2}|[!$&-.0-9;=A-Z_a-z~])+|(\[(([Vv][0-9A-Fa-f]+\.[!$&-.0-;=A-Z_a-z~]+)?|[.0-:A-Fa-f]+)\])?)(:\d*)?[/?]|[!$&-.0-;=?-Z_a-z~])(%[0-9A-Fa-f]{2}|[!$&-;=?-Z_a-z~])*|\/((%[0-9A-Fa-f]{2}|[!$&-.0-9;=A-Z_a-z~])+(:\d*)?|(\[(([Vv][0-9A-Fa-f]+\.[!$&-.0-;=A-Z_a-z~]+)?|[.0-:A-Fa-f]+)\])?:\d*|\[(([Vv][0-9A-Fa-f]+\.[!$&-.0-;=A-Z_a-z~]+)?|[.0-:A-Fa-f]+)\])?)?|[A-Za-z][+\-.0-9A-Za-z]*:?)?$/;

function isValidUriOrReference(value, requireScheme) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  if (/[\s<>"{}|\\^`]/.test(value)) {
    return false;
  }
  if (!URI_REFERENCE_REGEX.test(value)) {
    return false;
  }
  if (requireScheme) {
    try {
      const parsed = new URL(value);
      return Boolean(parsed.protocol);
    } catch {
      return false;
    }
  }
  return true;
}

function isValidDateTime(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(
      value,
    );
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }

  if (match[7]) {
    const offsetHour = Number(match[8]);
    const offsetMinute = Number(match[9]);
    if (offsetHour < 0 || offsetHour > 23 || offsetMinute < 0 || offsetMinute > 59) {
      return false;
    }
  }

  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function matchesSchemaType(value, expectedType) {
  if (Array.isArray(expectedType)) {
    return expectedType.some((t) => matchesSchemaType(value, t));
  }
  switch (expectedType) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

const MAX_SCHEMA_DEPTH = 40;

function validateAgainstSchemaNode(value, schemaNode, rootSchema, pathLabel, errors, depth = 0) {
  if (!schemaNode || typeof schemaNode !== 'object') {
    return;
  }
  if (depth > MAX_SCHEMA_DEPTH) {
    errors.push(`${pathLabel} exceeds maximum schema validation depth`);
    return;
  }

  let effectiveNode = schemaNode;
  if (typeof schemaNode.$ref === 'string') {
    const resolved = resolveSchemaRef(schemaNode.$ref, rootSchema);
    if (!resolved) {
      errors.push(`Unresolved schema reference at ${pathLabel}`);
      return;
    }
    effectiveNode = resolved;
  }

  if (effectiveNode.type !== undefined && !matchesSchemaType(value, effectiveNode.type)) {
    errors.push(`${pathLabel} has invalid type`);
    return;
  }

  if (Array.isArray(effectiveNode.enum) && !effectiveNode.enum.includes(value)) {
    errors.push(`${pathLabel} has unsupported enum value`);
    return;
  }

  if (typeof value === 'string') {
    if (typeof effectiveNode.pattern === 'string' && !isValidGuidOrPattern(value, effectiveNode.pattern)) {
      errors.push(`${pathLabel} does not match required pattern`);
    }
    if (effectiveNode.format === 'uri' && !isValidUriOrReference(value, true)) {
      errors.push(`${pathLabel} is not a valid URI`);
    } else if (effectiveNode.format === 'uri-reference' && !isValidUriOrReference(value, false)) {
      errors.push(`${pathLabel} is not a valid URI reference`);
    } else if (effectiveNode.format === 'date-time' && !isValidDateTime(value)) {
      errors.push(`${pathLabel} is not a valid date-time`);
    }
  }

  if (typeof value === 'number') {
    if (typeof effectiveNode.minimum === 'number' && value < effectiveNode.minimum) {
      errors.push(`${pathLabel} is below minimum`);
    }
    if (typeof effectiveNode.maximum === 'number' && value > effectiveNode.maximum) {
      errors.push(`${pathLabel} exceeds maximum`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof effectiveNode.minItems === 'number' && value.length < effectiveNode.minItems) {
      errors.push(`${pathLabel} has fewer than ${effectiveNode.minItems} item(s)`);
    }
    if (effectiveNode.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push(`${pathLabel} must not contain duplicate items`);
          break;
        }
        seen.add(key);
      }
    }
    if (effectiveNode.items && typeof effectiveNode.items === 'object') {
      for (let i = 0; i < value.length; i += 1) {
        validateAgainstSchemaNode(
          value[i],
          effectiveNode.items,
          rootSchema,
          `${pathLabel}[${i}]`,
          errors,
          depth + 1
        );
      }
    }
  }

  if (isPlainObject(value)) {
    if (Array.isArray(effectiveNode.required)) {
      for (const reqKey of effectiveNode.required) {
        if (!Object.prototype.hasOwnProperty.call(value, reqKey)) {
          errors.push(`${pathLabel}.${reqKey} is required`);
        }
      }
    }

    const props = isPlainObject(effectiveNode.properties) ? effectiveNode.properties : {};
    for (const [key, propVal] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        validateAgainstSchemaNode(
          propVal,
          props[key],
          rootSchema,
          `${pathLabel}.${key}`,
          errors,
          depth + 1
        );
      } else if (effectiveNode.additionalProperties === false) {
        errors.push(`${pathLabel} contains an unsupported property`);
      } else if (isPlainObject(effectiveNode.additionalProperties)) {
        validateAgainstSchemaNode(
          propVal,
          effectiveNode.additionalProperties,
          rootSchema,
          `${pathLabel}.<entry>`,
          errors,
          depth + 1
        );
      }
    }
  }

  if (Array.isArray(effectiveNode.anyOf)) {
    const anyPassed = effectiveNode.anyOf.some((branch) => {
      const branchErrors = [];
      validateAgainstSchemaNode(value, branch, rootSchema, pathLabel, branchErrors, depth + 1);
      return branchErrors.length === 0;
    });
    if (!anyPassed) {
      errors.push(`${pathLabel} failed anyOf schema constraint`);
    }
  }

  if (Array.isArray(effectiveNode.oneOf)) {
    let passCount = 0;
    for (const branch of effectiveNode.oneOf) {
      const branchErrors = [];
      validateAgainstSchemaNode(value, branch, rootSchema, pathLabel, branchErrors, depth + 1);
      if (branchErrors.length === 0) {
        passCount += 1;
      }
    }
    if (passCount !== 1) {
      errors.push(`${pathLabel} failed oneOf schema constraint`);
    }
  }
}

/**
 * Validates and normalizes a SARIF v2.1.0 document.
 *
 * @param {unknown} doc
 * @returns {{ valid: true, sarif: object, totalFindings: number, runCount: number } | { valid: false, reason: string }}
 */
export function validateSarifDocument(doc) {
  if (!isPlainObject(doc)) {
    return { valid: false, reason: 'SARIF root must be a plain object' };
  }

  if (doc.version !== SARIF_VERSION) {
    return { valid: false, reason: 'SARIF version must be "2.1.0"' };
  }

  if (!Array.isArray(doc.runs) || doc.runs.length !== 1) {
    return { valid: false, reason: 'SARIF runs must contain exactly 1 run' };
  }

  let totalFindings = 0;
  for (let i = 0; i < doc.runs.length; i += 1) {
    const run = doc.runs[i];
    if (!isPlainObject(run)) {
      return { valid: false, reason: `SARIF run[${i}] must be a plain object` };
    }
    if (!isPlainObject(run.tool) || !isPlainObject(run.tool.driver)) {
      return { valid: false, reason: `SARIF run[${i}].tool.driver must be an object` };
    }
    if (run.tool.driver.name !== EXPECTED_DRIVER_NAME) {
      return {
        valid: false,
        reason: `SARIF run[${i}].tool.driver.name must be "${EXPECTED_DRIVER_NAME}"`,
      };
    }
    if (
      run.automationDetails !== undefined &&
      (!isPlainObject(run.automationDetails) ||
        (run.automationDetails.id !== undefined &&
          (typeof run.automationDetails.id !== 'string' ||
            !run.automationDetails.id.startsWith(EXPECTED_AUTOMATION_ID_PREFIX))))
    ) {
      return {
        valid: false,
        reason: `SARIF run[${i}].automationDetails.id conflicts with expected category`,
      };
    }
    if (!Array.isArray(run.results)) {
      return { valid: false, reason: `SARIF run[${i}].results must be an array` };
    }
    totalFindings += run.results.length;
  }

  const schema =
    typeof doc.$schema === 'string' && doc.$schema.trim().length > 0
      ? doc.$schema
      : DEFAULT_SARIF_SCHEMA;

  const normalized = {
    $schema: schema,
    ...doc,
    version: SARIF_VERSION,
    runs: doc.runs,
  };

  const schemaErrors = [];
  validateAgainstSchemaNode(normalized, SARIF_SCHEMA, SARIF_SCHEMA, '$', schemaErrors);
  if (schemaErrors.length > 0) {
    return {
      valid: false,
      reason: `SARIF document failed schema validation (${schemaErrors[0]})`,
    };
  }

  // GitHub Code Scanning rejects uploads with duplicate run identities (same tool/automationId).
  const runKeys = new Set();
  for (let i = 0; i < normalized.runs.length; i += 1) {
    const run = normalized.runs[i];
    const driver = run.tool.driver;
    const runKey = JSON.stringify({
      name: driver.name,
      fullName: driver.fullName,
      version: driver.version,
      semanticVersion: driver.semanticVersion,
      guid: driver.guid,
      automationId: run.automationDetails?.id,
    });
    if (runKeys.has(runKey)) {
      return {
        valid: false,
        reason: `SARIF run[${i}] duplicates an earlier run identity`,
      };
    }
    runKeys.add(runKey);

    for (let j = 0; j < run.results.length; j += 1) {
      const finding = run.results[j];
      const ruleId = finding.ruleId;
      if (typeof ruleId !== 'string' || ruleId.trim().length === 0) {
        return {
          valid: false,
          reason: `SARIF run[${i}].results[${j}].ruleId must be a non-empty string`,
        };
      }
      const msgText = finding.message?.text;
      if (typeof msgText !== 'string' || msgText.trim().length === 0) {
        return {
          valid: false,
          reason: `SARIF run[${i}].results[${j}].message.text must be a non-empty string`,
        };
      }
      const primaryLocation = Array.isArray(finding.locations) ? finding.locations[0] : undefined;
      const primaryPhysical = primaryLocation?.physicalLocation;
      const primaryUri = primaryPhysical?.artifactLocation?.uri;
      if (!isRepositoryRelativeArtifactUri(primaryUri)) {
        return {
          valid: false,
          reason: `SARIF run[${i}].results[${j}].locations[0] must include a repository-relative physicalLocation.artifactLocation.uri`,
        };
      }
      const startLine = primaryPhysical?.region?.startLine;
      if (typeof startLine !== 'number' || !Number.isInteger(startLine) || startLine < 1) {
        return {
          valid: false,
          reason: `SARIF run[${i}].results[${j}].locations[0] must include a positive integer region.startLine`,
        };
      }
    }
  }

  return {
    valid: true,
    sarif: normalized,
    totalFindings,
    runCount: normalized.runs.length,
  };
}

function collectJsonCandidates(rawOutput) {
  const candidates = [];
  if (isPlainObject(rawOutput)) {
    candidates.push(rawOutput);
    return candidates;
  }
  if (typeof rawOutput !== 'string') {
    return candidates;
  }

  const direct = tryParseJson(rawOutput);
  if (direct.ok && isPlainObject(direct.value)) {
    candidates.push(direct.value);
    return candidates;
  }

  for (const line of rawOutput.split(/\r?\n/)) {
    const lineParsed = tryParseJson(line);
    if (lineParsed.ok && isPlainObject(lineParsed.value)) {
      candidates.push(lineParsed.value);
    }
  }

  for (const block of extractBalancedJsonObjects(rawOutput)) {
    const blockParsed = tryParseJson(block);
    if (blockParsed.ok && isPlainObject(blockParsed.value)) {
      candidates.push(blockParsed.value);
    }
  }

  return candidates;
}

function droidLogHasError(rawOutput) {
  return collectJsonCandidates(rawOutput).some((entry) => entry.is_error === true);
}

function extractSanitizedDroidErrorMetadata(rawOutput) {
  const candidates = collectJsonCandidates(rawOutput);

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const entry = candidates[i];
    if (entry.is_error !== true) {
      continue;
    }
    const parts = [];
    if (typeof entry.subtype === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(entry.subtype)) {
      parts.push(`subtype=${entry.subtype}`);
    }
    if (typeof entry.num_turns === 'number' && Number.isFinite(entry.num_turns)) {
      parts.push(`turns=${entry.num_turns}`);
    }
    if (typeof entry.duration_ms === 'number' && Number.isFinite(entry.duration_ms)) {
      parts.push(`duration_ms=${entry.duration_ms}`);
    }
    return parts.join(', ');
  }

  return '';
}

function tryParseJson(text) {
  if (typeof text !== 'string') {
    return { ok: false, value: null };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, value: null };
  }
}

function extractBalancedJsonObjects(text) {
  const candidates = [];
  let inString = false;
  let escapeNext = false;
  let depth = 0;
  let startIndex = -1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) {
        startIndex = i;
      }
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && startIndex !== -1) {
          candidates.push(text.slice(startIndex, i + 1));
          startIndex = -1;
        }
      }
    }
  }

  return candidates;
}

function extractSarifFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  // 1. Direct JSON parse
  const direct = tryParseJson(text);
  if (direct.ok) {
    const validation = validateSarifDocument(direct.value);
    if (validation.valid) {
      return validation;
    }
  }

  // 2. Fenced code blocks (e.g., ```json ... ``` or ``` ... ```)
  const fenceRegex = /```(?:json|sarif)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRegex.exec(text)) !== null) {
    const parsedFence = tryParseJson(match[1]);
    if (parsedFence.ok) {
      const validation = validateSarifDocument(parsedFence.value);
      if (validation.valid) {
        return validation;
      }
    }
  }

  // 3. Balanced JSON object blocks in freeform text
  const objectBlocks = extractBalancedJsonObjects(text);
  for (const block of objectBlocks) {
    const parsedBlock = tryParseJson(block);
    if (parsedBlock.ok) {
      const validation = validateSarifDocument(parsedBlock.value);
      if (validation.valid) {
        return validation;
      }
    }
  }

  return null;
}

/**
 * Extracts and validates a SARIF v2.1.0 document from `droid exec -o json` output
 * or raw text/JSON log content.
 *
 * @param {string | object} rawOutput
 * @returns {{ ok: true, sarif: object, totalFindings: number, runCount: number } | { ok: false, isError: boolean, reason: string }}
 */
export function extractSarifFromDroidOutput(rawOutput) {
  let parsed = null;

  if (typeof rawOutput === 'string') {
    const direct = tryParseJson(rawOutput);
    if (direct.ok) {
      parsed = direct.value;
    }
  } else if (isPlainObject(rawOutput)) {
    parsed = rawOutput;
  } else {
    return {
      ok: false,
      isError: false,
      reason: 'Missing or invalid SARIF output',
    };
  }

  if (isPlainObject(parsed)) {
    if (parsed.is_error === true) {
      return {
        ok: false,
        isError: true,
        reason: 'Unable to extract valid SARIF v2.1.0 report (droid is_error=true)',
      };
    }

    const directSarif = validateSarifDocument(parsed);
    if (directSarif.valid) {
      return {
        ok: true,
        sarif: directSarif.sarif,
        totalFindings: directSarif.totalFindings,
        runCount: directSarif.runCount,
      };
    }

    if (isPlainObject(parsed.result)) {
      const nestedValidation = validateSarifDocument(parsed.result);
      if (nestedValidation.valid) {
        return {
          ok: true,
          sarif: nestedValidation.sarif,
          totalFindings: nestedValidation.totalFindings,
          runCount: nestedValidation.runCount,
        };
      }
    }

    if (typeof parsed.result === 'string') {
      const extracted = extractSarifFromText(parsed.result);
      if (extracted) {
        return {
          ok: true,
          sarif: extracted.sarif,
          totalFindings: extracted.totalFindings,
          runCount: extracted.runCount,
        };
      }
    }
  }

  if (typeof rawOutput === 'string') {
    // Handle NDJSON / line-delimited droid events if present.
    // Scan all events first so a later is_error=true event always overrides any partial SARIF.
    const lines = rawOutput.split(/\r?\n/);
    let sawDroidError = false;
    let firstValidCandidate = null;
    for (const line of lines) {
      const lineParsed = tryParseJson(line);
      if (!lineParsed.ok || !isPlainObject(lineParsed.value)) {
        continue;
      }
      if (lineParsed.value.is_error === true) {
        sawDroidError = true;
        continue;
      }
      if (!firstValidCandidate) {
        const lineDirect = validateSarifDocument(lineParsed.value);
        if (lineDirect.valid) {
          firstValidCandidate = {
            ok: true,
            sarif: lineDirect.sarif,
            totalFindings: lineDirect.totalFindings,
            runCount: lineDirect.runCount,
          };
          continue;
        }
        if (typeof lineParsed.value.result === 'string') {
          const extracted = extractSarifFromText(lineParsed.value.result);
          if (extracted) {
            firstValidCandidate = {
              ok: true,
              sarif: extracted.sarif,
              totalFindings: extracted.totalFindings,
              runCount: extracted.runCount,
            };
          }
        }
      }
    }

    if (sawDroidError) {
      return {
        ok: false,
        isError: true,
        reason: 'Unable to extract valid SARIF v2.1.0 report (droid is_error=true)',
      };
    }

    if (firstValidCandidate) {
      return firstValidCandidate;
    }

    const fromRawText = extractSarifFromText(rawOutput);
    if (fromRawText) {
      return {
        ok: true,
        sarif: fromRawText.sarif,
        totalFindings: fromRawText.totalFindings,
        runCount: fromRawText.runCount,
      };
    }
  }

  return {
    ok: false,
    isError: false,
    reason: 'Missing or invalid SARIF output',
  };
}

/**
 * Parses CLI arguments with environment variable fallbacks.
 *
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env]
 */
export function parseCliArgs(argv, env = process.env) {
  let sarifInputPath = env.SARIF_INPUT_PATH || '';
  let logInputPath = env.DROID_LOG_PATH || '';
  let outputPath = env.SARIF_OUTPUT_PATH || '';
  let cleanup = false;
  let parseError = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cleanup') {
      cleanup = true;
    } else if (arg === '--sarif-input') {
      if (i + 1 >= argv.length) {
        parseError = 'Missing value for --sarif-input';
        break;
      }
      sarifInputPath = argv[++i];
    } else if (arg.startsWith('--sarif-input=')) {
      sarifInputPath = arg.slice('--sarif-input='.length);
    } else if (arg === '--log-input') {
      if (i + 1 >= argv.length) {
        parseError = 'Missing value for --log-input';
        break;
      }
      logInputPath = argv[++i];
    } else if (arg.startsWith('--log-input=')) {
      logInputPath = arg.slice('--log-input='.length);
    } else if (arg === '--output') {
      if (i + 1 >= argv.length) {
        parseError = 'Missing value for --output';
        break;
      }
      outputPath = argv[++i];
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.slice('--output='.length);
    } else {
      parseError = `Unknown argument: ${arg}`;
      break;
    }
  }

  return {
    sarifInputPath: sarifInputPath || undefined,
    logInputPath: logInputPath || undefined,
    outputPath: outputPath || undefined,
    cleanup,
    parseError,
  };
}

function tryReadFile(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function removeFileQuietly(filePath) {
  if (!filePath) {
    return;
  }
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup; do not mask primary result or leak paths.
  }
}

/**
 * Validates or extracts SARIF v2.1.0 output and writes the normalized report.
 *
 * @param {object} options
 * @param {string} [options.sarifInputPath]
 * @param {string} [options.logInputPath]
 * @param {string} [options.outputPath]
 * @param {boolean} [options.cleanup]
 * @param {{ write: (chunk: string) => void }} [options.stdout]
 * @param {{ write: (chunk: string) => void }} [options.stderr]
 */
export function prepareSecuritySarif(options = {}) {
  const {
    sarifInputPath,
    logInputPath,
    outputPath,
    cleanup = false,
    stdout = process.stdout,
    stderr = process.stderr,
  } = options;

  try {
    if (!outputPath || typeof outputPath !== 'string' || outputPath.trim().length === 0) {
      const message = 'Error: Missing required --output path';
      stderr.write(`${message}\n`);
      return { ok: false, isError: false, error: message };
    }

    let validated = null;

    // Step 1: Fail closed if the droid execution log reports an error (is_error=true),
    // even if a partial SARIF file was written to disk before failure.
    const logRaw = tryReadFile(logInputPath);
    const droidIsError = logRaw !== null && droidLogHasError(logRaw);

    let sarifValidationFailure = null;
    // Step 2: Check direct SARIF input file first (unless droid reported an error).
    if (!droidIsError) {
      const sarifRaw = tryReadFile(sarifInputPath);
      if (sarifRaw !== null) {
        const parsedSarif = tryParseJson(sarifRaw);
        if (parsedSarif.ok) {
          const result = validateSarifDocument(parsedSarif.value);
          if (result.valid) {
            validated = {
              sarif: result.sarif,
              totalFindings: result.totalFindings,
              runCount: result.runCount,
              source: 'sarif-input',
            };
          } else {
            sarifValidationFailure = result.reason;
          }
        } else {
          sarifValidationFailure = 'SARIF input file is not valid JSON';
        }
      }
    }

    // Step 3: Fall back to droid exec log/JSON output if needed.
    if (!validated && !droidIsError && logRaw !== null) {
      const extracted = extractSarifFromDroidOutput(logRaw);
      if (extracted.ok) {
        validated = {
          sarif: extracted.sarif,
          totalFindings: extracted.totalFindings,
          runCount: extracted.runCount,
          source: 'log-input',
        };
      }
    }

    if (!validated) {
      let message = 'Error: Missing or invalid SARIF output';
      if (droidIsError) {
        const droidDiagnostic = extractSanitizedDroidErrorMetadata(logRaw);
        message = droidDiagnostic
          ? `Error: Unable to extract valid SARIF v2.1.0 report (droid is_error=true; ${droidDiagnostic})`
          : 'Error: Unable to extract valid SARIF v2.1.0 report (droid is_error=true)';
      } else if (sarifValidationFailure) {
        message = `Error: ${sarifValidationFailure}`;
      }
      stderr.write(`${message}\n`);
      return { ok: false, isError: droidIsError, error: message };
    }

    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(validated.sarif, null, 2)}\n`, 'utf8');

    stdout.write(
      `SARIF validated: ${validated.totalFindings} findings across ${validated.runCount} run(s)\n`
    );

    return {
      ok: true,
      outputPath,
      totalFindings: validated.totalFindings,
      runCount: validated.runCount,
      source: validated.source,
    };
  } finally {
    if (cleanup) {
      const resolvedOutput = outputPath ? path.resolve(outputPath) : null;
      if (logInputPath && (!resolvedOutput || path.resolve(logInputPath) !== resolvedOutput)) {
        removeFileQuietly(logInputPath);
      }
      if (sarifInputPath && (!resolvedOutput || path.resolve(sarifInputPath) !== resolvedOutput)) {
        removeFileQuietly(sarifInputPath);
      }
    }
  }
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv, process.env);
  if (parsed.parseError) {
    process.stderr.write(`Error: ${parsed.parseError}\n`);
    process.exitCode = 1;
    return;
  }

  const result = prepareSecuritySarif(parsed);
  process.exitCode = result.ok ? 0 : 1;
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main();
}
