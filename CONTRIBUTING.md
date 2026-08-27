# Contributing to Aembit Edge SDKs

Thank you for your interest in contributing to the Aembit Edge SDKs! We welcome contributions, bug reports, and suggestions from the community.

## Code of Conduct & Security

- **No Secrets**: Never commit real tenant URLs, live API tokens, or secrets to the repository or tests. Always use representative placeholder values (e.g. `https://tenant.aembit.io`, `your-client-id`).
- **Clean Code & Typing**: Maintain strict type safety across all SDKs. Avoid `any` in TypeScript and provide full type annotations in Python.
- **License**: All contributions to this project will be licensed under the [Apache-2.0 License](./LICENSE).

## Branching Conventions

When opening pull requests, use short, descriptive branch names:

- `feat/<topic>` for new features or Trust Provider support
- `fix/<topic>` for bug fixes and patches
- `docs/<topic>` for documentation-only improvements
- `chore/<topic>` for tooling, dependency updates, and maintenance

Please avoid committing directly to `main`.

## Local Development & Quality Checks

Before submitting a pull request, ensure all relevant checks pass locally for the components you touched.

### TypeScript SDK (`ts/`)

Run from the `ts/` directory:

```bash
# Install dependencies
npm ci

# Run static analysis and linting
npm run lint

# Run TypeScript compilation and type checks
npm run typecheck

# Run test suite with Vitest
npm test

# Run tests with coverage assertions
npm run test:coverage

# (Optional) Run Stryker mutation tests
npm run test:mutation:changed
```

### Python SDK (`py/`)

Run from the `py/` directory using [`uv`](https://docs.astral.sh/uv/):

```bash
# Sync virtual environment and dev dependencies
uv sync --extra dev --locked

# Run Ruff linter and formatter checks
uv run ruff check .
uv run ruff format --check .

# Run Pyright static type checker
uv run pyright

# Run pytest test suite
uv run pytest

# Verify packaging and distribution builds
uv build --wheel --sdist
```

### Documentation & Repository Tools (Root)

Run from the repository root:

```bash
# Verify license headers across all source files
npm run lint:headers

# Verify Markdown formatting and link integrity
npm run lint:md
```

## Pull Request Guidelines

1. **Focused Scope**: Keep pull requests focused on a single change, feature, or bug fix.
2. **Tests Included**: Add deterministic unit or integration tests for all bug fixes and new features.
3. **Documentation**: Update the corresponding `README.md` and examples if modifying public interfaces, config options, or behavior.
4. **CI Verification**: Ensure all GitHub Actions status checks pass before requesting a review.
