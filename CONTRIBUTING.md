# Contributing

Thanks for contributing to Aembit Edge SDKs.

## Branching

Use short, descriptive branch names:

- `feat/<topic>` for new features
- `fix/<topic>` for bug fixes
- `docs/<topic>` for documentation-only changes
- `chore/<topic>` for maintenance/tooling

Avoid committing directly to `main`.

## Local Checks

For TypeScript SDK changes (from `ts/`):

```bash
npm run lint
npm run typecheck
npm test
```

For Markdown/documentation changes (from repo root):

```bash
npm run lint:md
```

If shell scripts changed (from repo root):

```bash
shellcheck scripts/*.sh
```

## Pull Requests

- Keep PRs small and focused.
- Include a clear summary and validation evidence.
- Update documentation/examples when behavior or public interfaces change.
- Do not include secrets, tokens, or real tenant identifiers.
