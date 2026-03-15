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
- built-in Trust Provider coverage for AWS Metadata Service (IMDSv2), AWS Role, and OIDC ID Token

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
- `trustProviders.awsRole({ region: "us-east-1" })` builds signed AWS STS `GetCallerIdentity` request data for `/edge/v1/auth`.
- `trustProviders.oidcIdToken({ identityToken })` sends `client.oidc.identityToken` in `/edge/v1/auth`.
- `clientId` is the Edge SDK Client ID from Trust Provider configuration.
- `clientId` is not the client workload `Client Identifier` value used in policy configuration.
- `server.host` and `server.port` are required.
- `server.transportProtocol` currently supports only `"TCP"` and defaults to `"TCP"` if omitted.
- AWS Role provider `region` is required.
- For OIDC, the application must supply the token value or a lazy token source.
  The SDK does not auto-discover OIDC tokens because token retrieval is runtime-specific.

When bundle size matters, import only the Trust Provider factory you need:

```ts
import { createAwsMetadataServiceTrustProvider } from "@aembit/edge-sdk-ts"
import { createAwsRoleTrustProvider } from "@aembit/edge-sdk-ts/trust-providers/aws-role"
import { createOidcIdTokenTrustProvider } from "@aembit/edge-sdk-ts/trust-providers/oidc-id-token"
```

Use `trustProviders` for convenience when bundle size is not a concern.

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

Current runnable examples:

- `ts/examples/aws-imds-ec2/` for EC2 + AWS IMDSv2 end-to-end validation
- `ts/examples/aws-role-lambda/` for AWS Lambda + AWS Role end-to-end validation

## Testing

- Test runner: Vitest
- Local development and test commands should use `npm`
- Linter: ESLint with `typescript-eslint` recommended checks

## Examples

Run from `ts/`:

- `npm run build:example:aws-imds-ec2`
- `npm run example:aws-imds-ec2`
- `npm run build:example:aws-role-lambda`
- `npm run example:aws-role-lambda:zip`
- example docs: `ts/examples/aws-imds-ec2/README.md`
- integration example: `ts/examples/aws-imds-ec2/index.ts`
- Lambda example docs: `ts/examples/aws-role-lambda/README.md`
- Lambda example source: `ts/examples/aws-role-lambda/index.ts`

Note: current Edge behavior requires setting `credentialType` on `/edge/v1/credentials` requests, so both examples set it explicitly.

Deploy a bundled example artifact to a VM (from repo root):

```bash
./scripts/deploy-ts-example-bundle-to-vm.sh \
  --artifact ./ts/examples/aws-imds-ec2/dist/index.mjs \
  --host ec2-xx-xx-xx-xx.compute.amazonaws.com \
  --user ubuntu \
  --key ~/.ssh/your-key.pem \
  --remote-dir ~/aembit-examples/aws-imds-ec2
```

The script uploads a built example bundle such as `dist/index.mjs`, not the whole `ts/` workspace.

Use a deploy config file:

```bash
cp ./scripts/deploy-ts-example-bundle-to-vm.env.example ./scripts/deploy-ts-example-bundle-to-vm.env
./scripts/deploy-ts-example-bundle-to-vm.sh --config ./scripts/deploy-ts-example-bundle-to-vm.env
```

Or via environment variables:

```bash
export DEPLOY_ARTIFACT=./ts/examples/aws-imds-ec2/dist/index.mjs
export DEPLOY_HOST=ec2-xx-xx-xx-xx.compute.amazonaws.com
export DEPLOY_USER=ubuntu
export DEPLOY_REMOTE_DIR=~/aembit-examples/aws-imds-ec2
./scripts/deploy-ts-example-bundle-to-vm.sh
```

## Troubleshooting

- Verify runtime version: `node -v` (must be `>=20`).
- Run `npm run check:node` to validate the active runtime before build/test commands.
- Some IDE, CI, or coding-agent shells may use a different Node version than your interactive terminal.
- `npm run build`, `npm run typecheck`, and `npm test` run a Node version precheck automatically.
- If commands fail with runtime/tooling import errors, switch to Node `>=20` using your preferred tool and reinstall dependencies:
  - `npm install` (or `npm ci` in clean environments)

## Roadmap Notes

- Bundler/tooling decision is pending; package output remains ESM-only

## Security

Do not include real tenant URLs, tokens, or secrets in examples or tests.
