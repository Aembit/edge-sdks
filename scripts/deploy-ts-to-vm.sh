#!/usr/bin/env sh
# Push the local ts/ workspace to a remote VM using tar + scp.
#
# Why tar + scp instead of plain `scp -r`?
# - `scp` does not support excludes.
# - We want to avoid copying bulky/generated files (node_modules, dist).
# - We also avoid copying local `.env` secrets by default.
#
# This script is POSIX-sh compatible and can be invoked from bash or zsh.

set -eu

print_help() {
  cat <<'USAGE'
Usage:
  ./scripts/deploy-ts-to-vm.sh --host <host> --user <user> --remote-dir <dir> [options]
  ./scripts/deploy-ts-to-vm.sh --config ./scripts/deploy-ts-to-vm.env [options]

Required:
  Either provide these via CLI flags, environment variables, or --config:
  --host <host>          Remote host (for example ec2-12-34-56-78.compute.amazonaws.com)
  --user <user>          Remote SSH user (for example ubuntu)
  --remote-dir <dir>     Remote directory where ts/ contents will be extracted

Optional:
  --config <path>        Path to .env-style deploy config file
  --key <path>           SSH private key path
  --port <port>          SSH port (default: 22)
  --clean-local          Remove local ts/node_modules and ts/dist before upload
  --help                 Show this help

Environment variables:
  DEPLOY_HOST
  DEPLOY_USER
  DEPLOY_REMOTE_DIR
  DEPLOY_SSH_KEY
  DEPLOY_SSH_PORT
  DEPLOY_CLEAN_LOCAL     0 (default) or 1

Precedence:
  CLI flags > environment variables > --config file > defaults

What gets uploaded:
  - Contents of local ts/ directory
  - Excludes: node_modules/, dist/, any .env* file, and .DS_Store files

Notes:
  - This script is aimed at deploying runnable examples to a VM while keeping transfer small.
  - It uploads a temporary tarball, extracts it remotely, then removes temp files.
USAGE
}

strip_wrapping_quotes() {
  value="$1"
  case "$value" in
    \"*\")
      value=${value#\"}
      value=${value%\"}
      ;;
    \'*\')
      value=${value#\'}
      value=${value%\'}
      ;;
  esac
  printf '%s' "$value"
}

quote_for_sh() {
  # Return a value single-quoted for safe POSIX shell interpolation.
  # Example: abc'def -> 'abc'"'"'def'
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\"'\"'/g")"
}

normalize_remote_dir() {
  value="$1"
  # If local shell already expanded "~" to local HOME, convert back to "~"
  # so remote-side expansion uses the remote user's home directory.
  case "$value" in
    "$HOME")
      printf '%s' "~"
      ;;
    "$HOME"/*)
      # Intentionally emit literal "~/" so remote-side expansion uses remote HOME.
      printf '%s/%s' \~ "${value#"$HOME"/}"
      ;;
    *)
      printf '%s' "$value"
      ;;
  esac
}

expand_tilde_path() {
  value="$1"
  case "$value" in
    "~")
      printf '%s' "$HOME"
      ;;
    # Match literal "~/" prefix for local key-path expansion.
    \~/*)
      printf '%s/%s' "$HOME" "${value#~/}"
      ;;
    *)
      printf '%s' "$value"
      ;;
  esac
}

parse_config_file() {
  config_path="$1"

  if [ ! -f "$config_path" ]; then
    echo "Error: config file not found: $config_path" >&2
    exit 1
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line=$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$line" in
      ''|\#*)
        continue
        ;;
    esac

    case "$line" in
      *=*)
        ;;
      *)
        echo "Warning: ignoring invalid config line: $line" >&2
        continue
        ;;
    esac

    key=${line%%=*}
    value=${line#*=}

    key=$(printf '%s' "$key" | sed 's/[[:space:]]*$//')
    value=$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    value=$(strip_wrapping_quotes "$value")

    case "$key" in
      DEPLOY_HOST)
        CFG_DEPLOY_HOST="$value"
        ;;
      DEPLOY_USER)
        CFG_DEPLOY_USER="$value"
        ;;
      DEPLOY_REMOTE_DIR)
        CFG_DEPLOY_REMOTE_DIR="$value"
        ;;
      DEPLOY_SSH_KEY)
        CFG_DEPLOY_SSH_KEY="$value"
        ;;
      DEPLOY_SSH_PORT)
        CFG_DEPLOY_SSH_PORT="$value"
        ;;
      DEPLOY_CLEAN_LOCAL)
        CFG_DEPLOY_CLEAN_LOCAL="$value"
        ;;
      *)
        # Ignore unknown keys so shared env files remain compatible.
        ;;
    esac
  done < "$config_path"
}

CONFIG_PATH=""

CLI_HOST=""
CLI_USER=""
CLI_REMOTE_DIR=""
CLI_SSH_KEY=""
CLI_SSH_PORT=""
CLI_CLEAN_LOCAL=""

CFG_DEPLOY_HOST=""
CFG_DEPLOY_USER=""
CFG_DEPLOY_REMOTE_DIR=""
CFG_DEPLOY_SSH_KEY=""
CFG_DEPLOY_SSH_PORT=""
CFG_DEPLOY_CLEAN_LOCAL=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      CLI_HOST="${2:-}"
      shift 2
      ;;
    --user)
      CLI_USER="${2:-}"
      shift 2
      ;;
    --remote-dir)
      CLI_REMOTE_DIR="${2:-}"
      shift 2
      ;;
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --key)
      CLI_SSH_KEY="${2:-}"
      shift 2
      ;;
    --port)
      CLI_SSH_PORT="${2:-}"
      shift 2
      ;;
    --clean-local)
      CLI_CLEAN_LOCAL="1"
      shift 1
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help >&2
      exit 1
      ;;
  esac
done

if [ -n "$CONFIG_PATH" ]; then
  parse_config_file "$CONFIG_PATH"
fi

HOST="${CLI_HOST:-${DEPLOY_HOST:-$CFG_DEPLOY_HOST}}"
USER_NAME="${CLI_USER:-${DEPLOY_USER:-$CFG_DEPLOY_USER}}"
REMOTE_DIR="${CLI_REMOTE_DIR:-${DEPLOY_REMOTE_DIR:-$CFG_DEPLOY_REMOTE_DIR}}"
SSH_KEY="${CLI_SSH_KEY:-${DEPLOY_SSH_KEY:-$CFG_DEPLOY_SSH_KEY}}"
SSH_PORT="${CLI_SSH_PORT:-${DEPLOY_SSH_PORT:-${CFG_DEPLOY_SSH_PORT:-22}}}"
CLEAN_LOCAL_RAW="${CLI_CLEAN_LOCAL:-${DEPLOY_CLEAN_LOCAL:-${CFG_DEPLOY_CLEAN_LOCAL:-0}}}"

if [ -z "$HOST" ] || [ -z "$USER_NAME" ] || [ -z "$REMOTE_DIR" ]; then
  echo "Error: host/user/remote-dir are required (via flags, env, or --config)." >&2
  print_help >&2
  exit 1
fi

case "$SSH_PORT" in
  ''|*[!0-9]*)
    echo "Error: SSH port must be numeric. Current: $SSH_PORT" >&2
    exit 1
    ;;
esac

case "$CLEAN_LOCAL_RAW" in
  0)
    CLEAN_LOCAL="0"
    ;;
  1)
    CLEAN_LOCAL="1"
    ;;
  *)
    echo "Error: DEPLOY_CLEAN_LOCAL (or --clean-local) must resolve to 0 or 1. Current: $CLEAN_LOCAL_RAW" >&2
    exit 1
    ;;
esac

if [ -n "$SSH_KEY" ]; then
  SSH_KEY=$(expand_tilde_path "$SSH_KEY")
fi

# Resolve repo root as parent of this script directory.
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
TS_DIR="$REPO_ROOT/ts"

if [ ! -d "$TS_DIR" ]; then
  echo "Error: expected ts/ directory at $TS_DIR" >&2
  exit 1
fi

if [ "$CLEAN_LOCAL" = "1" ]; then
  echo "Cleaning local generated directories: ts/node_modules, ts/dist"
  rm -rf "$TS_DIR/node_modules" "$TS_DIR/dist"
else
  echo "Skipping local cleanup (default behavior)."
fi

ARCHIVE_PATH=$(mktemp "${TMPDIR:-/tmp}/ts-upload.XXXXXX")
REMOTE_ARCHIVE="/tmp/ts-upload.$$.tar.gz"

cleanup_local() {
  rm -f "$ARCHIVE_PATH"
}

trap cleanup_local EXIT INT TERM

echo "Creating archive from ts/ (excluding node_modules, dist, .env*, .DS_Store)..."
# Build archive from inside ts/ so extraction places files directly in --remote-dir.
# Exclude local env files to avoid accidentally transferring secrets.
tar \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./.env*' \
  --exclude='*/.env*' \
  --exclude='./.DS_Store' \
  --exclude='*/.DS_Store' \
  -C "$TS_DIR" \
  -czf "$ARCHIVE_PATH" \
  .

echo "Uploading archive to ${USER_NAME}@${HOST}:${REMOTE_ARCHIVE}"
if [ -n "$SSH_KEY" ]; then
  scp -P "$SSH_PORT" -i "$SSH_KEY" "$ARCHIVE_PATH" "${USER_NAME}@${HOST}:${REMOTE_ARCHIVE}"
else
  scp -P "$SSH_PORT" "$ARCHIVE_PATH" "${USER_NAME}@${HOST}:${REMOTE_ARCHIVE}"
fi

echo "Extracting archive on remote host into ${REMOTE_DIR}"
NORMALIZED_REMOTE_DIR=$(normalize_remote_dir "$REMOTE_DIR")
REMOTE_DIR_Q=$(quote_for_sh "$NORMALIZED_REMOTE_DIR")
REMOTE_ARCHIVE_Q=$(quote_for_sh "$REMOTE_ARCHIVE")
REMOTE_CMD="set -eu; remote_dir=${REMOTE_DIR_Q}; remote_archive=${REMOTE_ARCHIVE_Q}; case \"\$remote_dir\" in \"~\") remote_dir=\$HOME ;; \"~/\"*) remote_dir=\$HOME/\${remote_dir#~/} ;; esac; mkdir -p \"\$remote_dir\"; tar -xzf \"\$remote_archive\" -C \"\$remote_dir\"; rm -f \"\$remote_archive\""
if [ -n "$SSH_KEY" ]; then
  ssh -p "$SSH_PORT" -i "$SSH_KEY" "${USER_NAME}@${HOST}" "$REMOTE_CMD"
else
  ssh -p "$SSH_PORT" "${USER_NAME}@${HOST}" "$REMOTE_CMD"
fi

echo "Done. Uploaded ts/ contents to ${USER_NAME}@${HOST}:${REMOTE_DIR}"
