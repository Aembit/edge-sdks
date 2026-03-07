# Aembit Edge SDKs

SDKs and examples for integrating applications and services with the [Aembit Edge API](https://docs.aembit.io/api-guide/edge/).

These libraries make it easier for developers to authenticate workloads and retrieve credentials through Aembit without interacting with the raw HTTP API directly.

The SDKs are intended for:

- AI agents and MCP servers  
- serverless functions  
- backend services  
- automation and CI/CD systems  
- other applications that need programmatic access to credentials managed by Aembit

Each SDK provides a developer-friendly interface for the Edge authentication and credential retrieval flow while handling common concerns such as request construction, token lifecycle management, and error handling.

## Repository Structure

This repository is organized as a multi-language SDK workspace.

TODO: add `tree` output here.

Each language directory contains:

- the SDK implementation  
- examples demonstrating common usage  
- language-specific documentation

## Project Status

This project is in early development.

The first SDK being implemented is **TypeScript**, which will serve as the reference implementation for the overall SDK design.

Additional SDKs for other languages will be added over time.

## Examples

Each SDK will include runnable example applications that demonstrate common usage patterns such as:

- authenticating a workload  
- retrieving credentials  
- using credentials to access protected services

Examples are intended to be minimal, practical, and easy to run.

## Contributing

Contributions are welcome.

If you are contributing code, please review:

AGENTS.md

This file contains repository guidelines and development conventions intended for both human contributors and coding agents.

## Documentation

Additional documentation about the architecture and SDK design can be found in:

docs/
spec/

## License

This project will be released under an open source license prior to public release.
