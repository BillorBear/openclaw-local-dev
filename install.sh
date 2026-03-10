#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/config.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

OPENCLAW_PROFILE="${OPENCLAW_PROFILE:-default}"
OPENCLAW_ACP_PLUGIN="${OPENCLAW_ACP_PLUGIN:-@openclaw/acpx}"
OPENCLAW_DEFAULT_AGENT="${OPENCLAW_DEFAULT_AGENT:-codex}"
OPENCLAW_CLI_PATH="${OPENCLAW_CLI_PATH:-$(command -v openclaw || true)}"
CODEX_CLI_PATH="${CODEX_CLI_PATH:-$(command -v codex || true)}"
ACP_ALLOWED_AGENTS="${ACP_ALLOWED_AGENTS:-[\"pi\",\"claude\",\"codex\",\"opencode\",\"gemini\",\"kimi\"]}"
PROJECT_ALIASES_FILE="${PROJECT_ALIASES_FILE:-$ROOT_DIR/project-aliases.json}"
CODEX_DISPATCH_TIMEOUT_SECONDS="${CODEX_DISPATCH_TIMEOUT_SECONDS:-900}"
CODEX_DISPATCH_MODEL="${CODEX_DISPATCH_MODEL:-}"

if [[ -z "${OPENCLAW_CLI_PATH}" ]]; then
  echo "openclaw not found in PATH and OPENCLAW_CLI_PATH is empty"
  exit 1
fi

if [[ ! -x "${OPENCLAW_CLI_PATH}" ]]; then
  echo "OPENCLAW_CLI_PATH is not executable: ${OPENCLAW_CLI_PATH}"
  exit 1
fi

if [[ -z "${CODEX_CLI_PATH}" ]]; then
  echo "codex not found in PATH and CODEX_CLI_PATH is empty"
  exit 1
fi

if [[ ! -x "${CODEX_CLI_PATH}" ]]; then
  echo "CODEX_CLI_PATH is not executable: ${CODEX_CLI_PATH}"
  exit 1
fi

echo "Using profile: ${OPENCLAW_PROFILE}"
echo "Using OpenClaw CLI: ${OPENCLAW_CLI_PATH}"
echo "Using Codex CLI: ${CODEX_CLI_PATH}"
echo "Using project aliases: ${PROJECT_ALIASES_FILE}"
echo "Installing ACP backend plugin: ${OPENCLAW_ACP_PLUGIN}"

"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" plugins install "${OPENCLAW_ACP_PLUGIN}"
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set plugins.entries.acpx.enabled true --strict-json

echo "Installing local Codex dispatch plugin"
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" plugins install -l "${ROOT_DIR}"
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set plugins.entries.codex-dispatch.enabled true --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set 'plugins.entries["codex-dispatch"].config.aliasesFile' "\"${PROJECT_ALIASES_FILE}\"" --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set 'plugins.entries["codex-dispatch"].config.codexCommand' "\"${CODEX_CLI_PATH}\"" --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set 'plugins.entries["codex-dispatch"].config.timeoutSeconds' "${CODEX_DISPATCH_TIMEOUT_SECONDS}" --strict-json
if [[ -n "${CODEX_DISPATCH_MODEL}" ]]; then
  "${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set 'plugins.entries["codex-dispatch"].config.model' "\"${CODEX_DISPATCH_MODEL}\"" --strict-json
fi

echo "Writing ACP baseline config"
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.enabled true --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.dispatch.enabled true --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.backend '"acpx"' --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.defaultAgent "\"${OPENCLAW_DEFAULT_AGENT}\"" --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.allowedAgents "${ACP_ALLOWED_AGENTS}" --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.maxConcurrentSessions 8 --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.stream.coalesceIdleMs 300 --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.stream.maxChunkChars 1200 --strict-json
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set acp.runtime.ttlMinutes 120 --strict-json

echo "Pinning absolute Codex CLI path for OpenClaw CLI fallback"
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config set 'agents.defaults.cliBackends["codex-cli"].command' "\"${CODEX_CLI_PATH}\"" --strict-json

echo
echo "Install completed."
echo "Config file:"
"${OPENCLAW_CLI_PATH}" --profile "${OPENCLAW_PROFILE}" config file
echo
echo "Next steps:"
echo "1. Restart the gateway: ${OPENCLAW_CLI_PATH} --profile ${OPENCLAW_PROFILE} gateway restart"
echo "2. Resolve a project alias: bash project-alias.sh doctor backend-main"
echo "3. In WebChat/Feishu, send: 在 backend-main 里修复某个接口，直接改代码并返回 diff"
echo "4. Or use CLI fallback: ${OPENCLAW_CLI_PATH} --profile ${OPENCLAW_PROFILE} agent --message \"hi\" --model codex-cli/gpt-5.3-codex"
