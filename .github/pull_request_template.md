# Summary

- Describe what changed and why.

## Validation

- List the checks you ran. Include only the ones relevant to this change.
- `cd ts && npm run lint && npm run typecheck && npm test` (if `ts/` changed)
- `cd py && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` (if `py/` changed)
- `cd py && uv build --wheel --sdist` (if Python packaging/build config changed)
- `npm run lint:md` (repo root, if Markdown changed)
- `shellcheck scripts/*.sh` (repo root, if shell scripts changed)

## Docs And Examples

- [ ] Updated docs/READMEs/examples for behavior or API changes
- [ ] Not applicable

## Risk

- Describe regression risk and rollout impact.

## Security

- [ ] No secrets, tokens, or real tenant identifiers added
