#!/usr/bin/env bash
# 맥북 전체 자동 설정 + 화면 공유 자동 열기

set -euo pipefail

REPO="https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup"
STUDIO_HOST="macstudio"
MAC_USER="$(whoami)"
SSH_KEY="$HOME/.ssh/id_ed25519_macremote"

echo "[1/4] Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
open -a Tailscale 2>/dev/null || true

if ! tailscale status &>/dev/null 2>&1; then
  echo "→ Tailscale 로그인 창에서 같은 계정으로 로그인하세요"
  sudo tailscale up || true
fi

echo "[2/4] Mac Studio 찾기..."
sleep 3
STUDIO_IP="$(tailscale status 2>/dev/null | awk '$2 == "macstudio" {print $1; exit}')"
[[ -z "$STUDIO_IP" ]] && STUDIO_IP="100.90.126.19"

echo "[3/4] SSH 설정..."
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
[[ -f "$SSH_KEY" ]] || ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "macremote" >/dev/null

SSH_CONFIG="$HOME/.ssh/config"
touch "$SSH_CONFIG"
chmod 600 "$SSH_CONFIG"
if ! grep -q "Host work-mac" "$SSH_CONFIG" 2>/dev/null; then
  cat >> "$SSH_CONFIG" << EOF

Host work-mac
  HostName macstudio
  User $MAC_USER
  IdentityFile $SSH_KEY
  AddKeysToAgent yes
EOF
fi

echo "→ Mac Studio 비밀번호를 한 번 입력하세요 (맥북 비밀번호 아님!)"
ssh-copy-id -i "${SSH_KEY}.pub" -o StrictHostKeyChecking=accept-new "$MAC_USER@$STUDIO_HOST" 2>/dev/null || true

echo "[4/4] Mac Studio 화면 열기..."
sleep 1
open "vnc://$STUDIO_HOST"

echo ""
echo "✅ 완료! Mac Studio 화면 창이 열립니다."
echo "   사용자: $MAC_USER (Mac Studio 계정과 같으면 그대로, 다르면 Mac Studio 사용자명 입력)"
echo "   암호:   Mac Studio 로그인 암호"
