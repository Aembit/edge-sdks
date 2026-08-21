#!/usr/bin/env bash
# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
# Exit immediately if any command fails
set -e

# Navigate to the script's directory (py/) to ensure it runs correctly from anywhere
cd "$(dirname "$0")"

echo "=== Syncing dev dependencies with lockfile ==="
# Installs dev tools (like pytest) strictly matching uv.lock (like dotnet restore --locked-mode)
uv sync --extra dev --locked

echo "=== Running pytest via uv ==="
# "$@" passes any arguments from test.sh directly to pytest (e.g., ./test.sh -v)
uv run pytest "$@"
