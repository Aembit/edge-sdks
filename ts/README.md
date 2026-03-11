# Aembit Edge TypeScript SDK

TypeScript SDK for interacting with the Aembit Edge API.

This SDK is the reference implementation for behavior and concepts used by other language SDKs in this repository.

## Status

The TypeScript SDK is in active development.

## Runtime And Packaging

- Node.js-first SDK target: `>=20`
- Package output: ESM-only

## v1 Scope

Planned v1 behavior:

- high-level Edge client for authentication and credential retrieval
- automatic token lifecycle management
- retry logic for transient failures
- built-in Trust Provider coverage starting with AWS Metadata Service (IMDSv2)

## Client API (Current)

The SDK now exposes `EdgeClient` as the developer-facing API.

```ts
import { EdgeClient, trustProviders } from "@aembit/edge-sdk-ts"

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsMetadataService()
})

await client.authenticate()

const credential = await client.getCredential({
  server: {
    host: "db.internal",
    port: 443
  }
})
```

Notes:

- `authenticate()` updates SDK session state and does not return raw bearer tokens.
- `getCredential()` auto-authenticates when no valid token is cached.
- `trustProviders.awsMetadataService()` collects identity from AWS IMDSv2.
- `clientId` is the Edge SDK Client ID from Trust Provider configuration.
- `clientId` is not the client workload `Client Identifier` value used in policy configuration.
- `server.host` and `server.port` are required.
- `server.transportProtocol` currently supports only `"TCP"` and defaults to `"TCP"` if omitted.

## Documentation

- Implementation and agent guidance: `ts/AGENTS.md`
- TypeScript architecture design: `ts/architecture.md`
- Cross-language contracts and API snapshots: `spec/` and `spec/openapi/`
- Cross-language architecture: `docs/architecture.md`
- Official Aembit Edge API docs (canonical API semantics): <https://docs.aembit.io/api-guide/edge/>

## Local Development

Run from `ts/`:

- `npm install`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Package status:

- `ts/package.json` is currently marked `private: true`.
- Revisit package publish metadata and release workflow when publish work starts.

## Planned Layout

Expected TypeScript SDK structure:

- `ts/src/` SDK source code
- `ts/examples/` runnable examples
- colocated tests as `*.test.ts` beside source files

Current runnable example:

- `ts/examples/aws-imds-ec2/` for EC2 + AWS IMDSv2 end-to-end validation

## Testing

- Test runner: Vitest
- Local development and test commands should use `npm`
- Linter: ESLint with `typescript-eslint` recommended checks

## Examples

Run from `ts/`:

- `npm run example:aws-imds`
- `npm run example:aws-imds:envfile`
- example docs: `ts/examples/aws-imds-ec2/README.md`
- integration example: `ts/examples/aws-imds-ec2/index.mjs`

Note: `npm run example:aws-imds:envfile` uses `node --env-file` and requires Node `20.6+`.
Note: current Edge behavior requires setting `credentialType` on `/edge/v1/credentials` requests (the AWS example sets `AEMBIT_CREDENTIAL_TYPE` as required).

Deploy `ts/` to a VM (from repo root):

```bash
./scripts/deploy-ts-to-vm.sh \
  --host ec2-xx-xx-xx-xx.compute.amazonaws.com \
  --user ubuntu \
  --key ~/.ssh/your-key.pem \
  --remote-dir ~/edge-sdks/ts
```

The script uploads `ts/` while excluding `node_modules`, `dist`, `.env*`, and `.DS_Store`.
It does not delete local `ts/node_modules` or `ts/dist` unless you pass `--clean-local` (or set `DEPLOY_CLEAN_LOCAL=1`).

Use a deploy config file:

```bash
cp ./scripts/deploy-ts-to-vm.env.example ./scripts/deploy-ts-to-vm.env
./scripts/deploy-ts-to-vm.sh --config ./scripts/deploy-ts-to-vm.env
```

Or via environment variables:

```bash
export DEPLOY_HOST=ec2-xx-xx-xx-xx.compute.amazonaws.com
export DEPLOY_USER=ubuntu
export DEPLOY_REMOTE_DIR=~/edge-sdks/ts
./scripts/deploy-ts-to-vm.sh
```

## Troubleshooting

- Verify runtime version: `node -v` (must be `>=20`).
- Run `npm run check:node` to validate the active runtime before build/test commands.
- Some IDE, CI, or coding-agent shells may use a different Node version than your interactive terminal.
- `npm run build`, `npm run typecheck`, and `npm test` run a Node version precheck automatically.
- If commands fail with runtime/tooling import errors, switch to Node `>=20` using your preferred tool and reinstall dependencies:
  - `npm install` (or `npm ci` in clean environments)

## Roadmap Notes

- Additional Trust Provider support beyond AWS Metadata Service (for example AWS Role and OIDC)
- Bundler/tooling decision is pending; package output remains ESM-only

## Security

Do not include real tenant URLs, tokens, or secrets in examples or tests.
