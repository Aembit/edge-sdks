// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
/**
 * Resolves a request path against a base URL.
 */
export function resolveRequestUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

/**
 * Detects abort-controller cancellation errors across runtime implementations.
 */
export function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}
