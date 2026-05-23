#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Hermes Agent installer for ArcMind (self-hosted sovereign LLM fallback).
#
# After install, set HERMES_URL on the ArcMind server to the resulting
# endpoint (default http://localhost:8080) and Hermes will join the LLM
# routing chain in server/src/llm.ts as the third provider after OpenRouter
# and Anthropic.
#
# Docs: https://hermes-agent.nousresearch.com/docs/
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-/opt/hermes}"
HERMES_BACKEND="${HERMES_BACKEND:-docker}"

echo "Installing Hermes Agent → ${HERMES_HOME} (backend: ${HERMES_BACKEND})"
mkdir -p "${HERMES_HOME}"
cd "${HERMES_HOME}"

INSTALLER_URL="https://hermes-agent.nousresearch.com/install.sh"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required" >&2
  exit 1
fi

echo "Downloading installer…"
curl -fsSL "${INSTALLER_URL}" -o /tmp/hermes-install.sh
chmod +x /tmp/hermes-install.sh

echo "Running upstream installer…"
HERMES_HOME="${HERMES_HOME}" /tmp/hermes-install.sh

echo "Configuring backend (${HERMES_BACKEND})…"
hermes setup --backend "${HERMES_BACKEND}" --non-interactive || {
  echo "WARN: 'hermes setup' did not run cleanly — finish setup manually." >&2
}

cat <<'EOF'

──────────────────────────────────────────────────────────────────────────
Hermes installed.

Next steps on the ArcMind server host:

  export HERMES_URL=http://localhost:8080
  # optional bearer if your Hermes is behind a reverse proxy with auth:
  export HERMES_API_KEY=…

Restart the ArcMind server. server/src/llm.ts will pick Hermes up as the
third LLM provider in the chain (OpenRouter → Anthropic → Hermes). When
all upstream providers fail or are missing keys, Hermes provides a
sovereign on-prem completion path.

Optional — register ArcMind as a Hermes skill so other Hermes runners
can hire your agent:

  hermes skill add infra/hermes/skills/arcmind.yaml
──────────────────────────────────────────────────────────────────────────
EOF
