# OpenAPI Snapshot Metadata

This directory stores pinned OpenAPI snapshots used to develop and validate SDK behavior.

## Current Snapshot

- File: `edge-sdk-v1.yaml`
- OpenAPI version: `3.1.1`
- API title: `Aembit Edge API`
- API version (`info.version`): `1.0.0`
- Retrieved on: `2026-08-10T22:39:19-07:00`
- Source URL: `https://docs.aembit.io/edge.yaml`

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

- The snapshot filename `edge-sdk-v1.yaml` reflects the versioned OpenAPI spec snapshot for Aembit Edge API v1.
