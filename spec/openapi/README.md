# OpenAPI Snapshot Metadata

This directory stores pinned OpenAPI snapshots used to develop and validate SDK behavior.

## Current Snapshot

- File: `api-1.yaml`
- OpenAPI version: `3.0.4`
- API title: `Aembit Edge API`
- API version (`info.version`): `v1`
- Retrieved on: `2026-03-07T17:37:55Z`
- Source URL: `https://docs.aembit.io/api-guide/edge/api-reference-edge`

## Why This Is Committed

Keeping a pinned spec snapshot in-repo provides:

- reproducible SDK generation and contract checks
- stable review diffs when API contracts change
- offline development support

## Update Process

When replacing or adding a spec snapshot:

1. Keep the previous snapshot unless there is a strong reason to remove it.
2. Add/update metadata in this file:
   - exact source URL
   - retrieval date
   - relevant API/spec version
3. Include SDK/test/doc updates in the same PR when contract changes affect behavior.

## Notes

- The current filename (`api-1.yaml`) is preserved as-downloaded.
- Consider a future rename to a versioned name (example: `edge-v1-openapi.yaml`) when convenient.
