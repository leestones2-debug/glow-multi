#!/usr/bin/env bash
# Mac Studio — 명령 한 줄로 전체 설정
# curl -fsSL .../install-mac-studio.sh | sudo bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-mac-studio.sh"

if [[ ! -f "$SETUP" ]]; then
  REPO="https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup"
  TMP="$(mktemp -d)"
  curl -fsSL "$REPO/setup-mac-studio.sh" -o "$TMP/setup-mac-studio.sh"
  curl -fsSL "$REPO/verify-mac-studio.sh" -o "$TMP/verify-mac-studio.sh"
  chmod +x "$TMP"/*.sh
  SETUP="$TMP/setup-mac-studio.sh"
  export MAC_REMOTE_TMP="$TMP"
fi

export AUTO_TAILSCALE=1
export AUTO_TAILSCALE_UP=1

bash "$SETUP"

if [[ -n "${MAC_REMOTE_TMP:-}" ]]; then
  bash "$MAC_REMOTE_TMP/verify-mac-studio.sh" || true
fi
