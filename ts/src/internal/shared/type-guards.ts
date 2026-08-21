// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
/**
 * Returns true when value is a non-null object and not an array.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
