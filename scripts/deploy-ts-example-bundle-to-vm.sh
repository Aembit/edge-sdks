#!/usr/bin/env sh
# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
# Copy a built TypeScript example bundle to a remote VM with scp.

set -eu

print_help() {
  cat <<'USAGE'
Usage:
  ./scripts/deploy-ts-example-bundle-to-vm.sh --artifact <path> --host <host> --user <user> --remote-dir <dir> [options]
  ./scripts/deploy-ts-example-bundle-to-vm.sh --config ./scripts/deploy-ts-example-bundle-to-vm.env [options]

Required:
  Either provide these via CLI flags, environment variables, or --config:
  --artifact <path>      Local built example artifact to upload
  --host <host>          Remote host
  --user <user>          Remote SSH user
  --remote-dir <dir>     Remote directory for the uploaded artifact

Optional:
  --config <path>        Path to .env-style deploy config file
  --key <path>           SSH private key path
  --port <port>          SSH port (default: 22)
  --remote-name <name>   Uploaded filename (default: basename of --artifact)
  --help                 Show this help

Environment variables:
  DEPLOY_ARTIFACT
  DEPLOY_HOST
  DEPLOY_USER
  DEPLOY_REMOTE_DIR
  DEPLOY_REMOTE_NAME
  DEPLOY_SSH_KEY
  DEPLOY_SSH_PORT

Precedence:
  CLI flags > environment variables > --config file > defaults
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
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\"'\"'/g")"
}

quote_remote_path() {
  value="$1"
  case "$value" in
    "~")
      printf '%s' "~"
      ;;
    \~/*)
      printf '%s/%s' \~ "$(quote_for_sh "${value#\~/}")"
      ;;
    *)
      quote_for_sh "$value"
      ;;
  esac
}

normalize_remote_dir() {
  value="$1"
  case "$value" in
    "$HOME")
      printf '%s' "~"
      ;;
    "$HOME"/*)
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
    \~/*)
      printf '%s/%s' "$HOME" "${value#\~/}"
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
      DEPLOY_ARTIFACT)
        CFG_DEPLOY_ARTIFACT="$value"
        ;;
      DEPLOY_HOST)
        CFG_DEPLOY_HOST="$value"
        ;;
      DEPLOY_USER)
        CFG_DEPLOY_USER="$value"
        ;;
      DEPLOY_REMOTE_DIR)
        CFG_DEPLOY_REMOTE_DIR="$value"
        ;;
      DEPLOY_REMOTE_NAME)
        CFG_DEPLOY_REMOTE_NAME="$value"
        ;;
      DEPLOY_SSH_KEY)
        CFG_DEPLOY_SSH_KEY="$value"
        ;;
      DEPLOY_SSH_PORT)
        CFG_DEPLOY_SSH_PORT="$value"
        ;;
      *)
        ;;
    esac
  done < "$config_path"
}

CONFIG_PATH=""

CLI_ARTIFACT=""
CLI_HOST=""
CLI_USER=""
CLI_REMOTE_DIR=""
CLI_REMOTE_NAME=""
CLI_SSH_KEY=""
CLI_SSH_PORT=""

CFG_DEPLOY_ARTIFACT=""
CFG_DEPLOY_HOST=""
CFG_DEPLOY_USER=""
CFG_DEPLOY_REMOTE_DIR=""
CFG_DEPLOY_REMOTE_NAME=""
CFG_DEPLOY_SSH_KEY=""
CFG_DEPLOY_SSH_PORT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --artifact)
      CLI_ARTIFACT="${2:-}"
      shift 2
      ;;
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
    --remote-name)
      CLI_REMOTE_NAME="${2:-}"
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

ARTIFACT="${CLI_ARTIFACT:-${DEPLOY_ARTIFACT:-$CFG_DEPLOY_ARTIFACT}}"
HOST="${CLI_HOST:-${DEPLOY_HOST:-$CFG_DEPLOY_HOST}}"
USER_NAME="${CLI_USER:-${DEPLOY_USER:-$CFG_DEPLOY_USER}}"
REMOTE_DIR="${CLI_REMOTE_DIR:-${DEPLOY_REMOTE_DIR:-$CFG_DEPLOY_REMOTE_DIR}}"
REMOTE_NAME="${CLI_REMOTE_NAME:-${DEPLOY_REMOTE_NAME:-$CFG_DEPLOY_REMOTE_NAME}}"
SSH_KEY="${CLI_SSH_KEY:-${DEPLOY_SSH_KEY:-$CFG_DEPLOY_SSH_KEY}}"
SSH_PORT="${CLI_SSH_PORT:-${DEPLOY_SSH_PORT:-${CFG_DEPLOY_SSH_PORT:-22}}}"

if [ -z "$ARTIFACT" ] || [ -z "$HOST" ] || [ -z "$USER_NAME" ] || [ -z "$REMOTE_DIR" ]; then
  echo "Error: artifact/host/user/remote-dir are required (via flags, env, or --config)." >&2
  print_help >&2
  exit 1
fi

case "$SSH_PORT" in
  ''|*[!0-9]*)
    echo "Error: SSH port must be numeric. Current: $SSH_PORT" >&2
    exit 1
    ;;
esac

ARTIFACT=$(expand_tilde_path "$ARTIFACT")
if [ ! -f "$ARTIFACT" ]; then
  echo "Error: artifact not found: $ARTIFACT" >&2
  exit 1
fi

if [ -z "$REMOTE_NAME" ]; then
  REMOTE_NAME=$(basename "$ARTIFACT")
fi

REMOTE_DIR=$(normalize_remote_dir "$REMOTE_DIR")
SSH_KEY=$(expand_tilde_path "$SSH_KEY")

if [ -n "$SSH_KEY" ]; then
  SSH_HAS_KEY="1"
else
  SSH_HAS_KEY="0"
fi

REMOTE_UPLOAD="/tmp/ts-example-upload.$$"
REMOTE_DIR_DISPLAY=$(quote_remote_path "$REMOTE_DIR")
REMOTE_NAME_Q=$(quote_for_sh "$REMOTE_NAME")
REMOTE_CMD="set -eu; remote_dir=$(quote_for_sh "$REMOTE_DIR"); remote_name=$(quote_for_sh "$REMOTE_NAME"); remote_upload=$(quote_for_sh "$REMOTE_UPLOAD"); case \"\$remote_dir\" in \"~\") remote_dir=\$HOME ;; \"~/\"*) remote_dir=\$HOME/\${remote_dir#\~/} ;; esac; mkdir -p \"\$remote_dir\"; mv \"\$remote_upload\" \"\$remote_dir/\$remote_name\""

echo "Uploading $(basename "$ARTIFACT") to temporary remote path $REMOTE_UPLOAD"
set -- -P "$SSH_PORT"
if [ "$SSH_HAS_KEY" = "1" ]; then
  set -- "$@" -i "$SSH_KEY"
fi
scp "$@" "$ARTIFACT" "$USER_NAME@$HOST:$REMOTE_UPLOAD"

echo "Moving artifact into $USER_NAME@$HOST:$REMOTE_DIR/$REMOTE_NAME"
set -- -p "$SSH_PORT"
if [ "$SSH_HAS_KEY" = "1" ]; then
  set -- "$@" -i "$SSH_KEY"
fi
# shellcheck disable=SC2029
ssh "$@" "$USER_NAME@$HOST" "$REMOTE_CMD"

echo "Done."
echo "Run on the remote VM:"
echo "  cd $REMOTE_DIR_DISPLAY"
echo "  node $REMOTE_NAME_Q"
