#!/usr/bin/env bash
# Exit immediately if any command fails
set -e

# Navigate to the script's directory (py/) to ensure it runs correctly from anywhere
cd "$(dirname "$0")"

echo "=== Checking virtual environment ==="
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

# Activate the virtual environment based on the OS (Bash vs. Git Bash/Windows)
if [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
else
    source .venv/bin/activate
fi

echo "=== Ensuring pip is up-to-date ==="
python -m pip install --quiet --upgrade pip

echo "=== Installing aembit_edge in editable mode with dev dependencies ==="
python -m pip install --quiet -e .[dev]

echo "=== Running pytest ==="
# "$@" passes any arguments from test.sh directly to pytest (e.g., ./test.sh -v)
pytest "$@"
