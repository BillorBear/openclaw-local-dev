#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/config.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

OPENCLAW_CLI_PATH="${OPENCLAW_CLI_PATH:-$(command -v openclaw || true)}"
ALIASES_FILE="${PROJECT_ALIASES_FILE:-$ROOT_DIR/project-aliases.json}"

if [[ ! -f "$ALIASES_FILE" ]]; then
  echo "project aliases file not found: $ALIASES_FILE" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found in PATH" >&2
  exit 1
fi

if [[ -z "${OPENCLAW_CLI_PATH}" ]]; then
  echo "openclaw not found in PATH and OPENCLAW_CLI_PATH is empty" >&2
  exit 1
fi

if [[ ! -x "${OPENCLAW_CLI_PATH}" ]]; then
  echo "OPENCLAW_CLI_PATH is not executable: ${OPENCLAW_CLI_PATH}" >&2
  exit 1
fi

cmd="${1:-list}"
alias_name="${2:-}"

resolve_alias() {
  python3 - "$ALIASES_FILE" "$1" <<'PY'
import json
import os
import sys

aliases_path = sys.argv[1]
alias_name = sys.argv[2]

with open(aliases_path, "r", encoding="utf-8") as f:
    data = json.load(f)

projects = data.get("projects", {})
default = data.get("default")

if not alias_name:
    alias_name = default

if not alias_name:
    print("no alias specified and no default alias configured", file=sys.stderr)
    sys.exit(2)

path = projects.get(alias_name)
if not path:
    print(f"unknown alias: {alias_name}", file=sys.stderr)
    sys.exit(3)

print(os.path.abspath(os.path.expanduser(path)))
PY
}

case "$cmd" in
  list)
    python3 - "$ALIASES_FILE" <<'PY'
import json
import os
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)

default = data.get("default")
projects = data.get("projects", {})

for name in sorted(projects):
    marker = "*" if name == default else " "
    path = os.path.abspath(os.path.expanduser(projects[name]))
    print(f"{marker} {name}\t{path}")
PY
    ;;
  path)
    resolve_alias "$alias_name"
    ;;
  cwd-command)
    path="$(resolve_alias "$alias_name")"
    printf '/acp cwd %q\n' "$path"
    ;;
  client)
    path="$(resolve_alias "$alias_name")"
    shift 2 || true
    exec "${OPENCLAW_CLI_PATH}" acp client --cwd "$path" "$@"
    ;;
  doctor)
    path="$(resolve_alias "$alias_name")"
    echo "Project: $path"
    echo "Use these in OpenClaw:"
    printf '  /acp cwd %q\n' "$path"
    echo '  /acp spawn codex --mode persistent --thread auto'
    ;;
  *)
    cat <<'EOF' >&2
Usage:
  bash project-alias.sh list
  bash project-alias.sh path <alias>
  bash project-alias.sh cwd-command <alias>
  bash project-alias.sh client <alias> [--server ...]
  bash project-alias.sh doctor <alias>
EOF
    exit 1
    ;;
esac
