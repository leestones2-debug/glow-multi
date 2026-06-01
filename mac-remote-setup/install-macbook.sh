#!/usr/bin/env bash
# MacBook — 명령 한 줄로 전체 설정
# curl -fsSL .../install-macbook.sh | bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "이 스크립트는 macOS(맥북)에서만 실행할 수 있습니다."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  맥북 원격 연결 자동 설정"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Tailscale 설치 ──
info "1/5 Tailscale 설치..."
if command -v tailscale &>/dev/null; then
  ok "Tailscale 이미 설치됨"
else
  curl -fsSL https://tailscale.com/install.sh | sh
  ok "Tailscale 설치 완료"
fi

# ── 2. Tailscale 로그인 ──
info "2/5 Tailscale 연결..."
if tailscale status &>/dev/null 2>&1; then
  ok "Tailscale 이미 연결됨"
else
  echo ""
  echo -e "${YELLOW}▶ 브라우저가 열리면 Google/Apple/Microsoft 계정으로 로그인하세요.${NC}"
  echo -e "${YELLOW}▶ Mac Studio와 같은 계정으로 로그인해야 합니다!${NC}"
  echo ""
  sudo tailscale up || fail "Tailscale 연결 실패"
  ok "Tailscale 연결 완료"
fi

# ── 3. Mac Studio 자동 찾기 ──
info "3/5 Mac Studio 찾는 중..."
sleep 2

MAC_STUDIO_HOST=""
MAC_STUDIO_IP=""

# Tailscale 목록에서 Mac Studio 후보 찾기 (자기 자신 제외)
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  host="$(echo "$line" | awk '{print $2}')"
  ip="$(echo "$line" | awk '{print $1}')"
  [[ "$host" == "$(hostname -s 2>/dev/null || hostname)" ]] && continue
  [[ "$host" == "$(scutil --get LocalHostName 2>/dev/null)"* ]] && continue

  if echo "$host" | grep -qiE 'studio|mac-studio|work-mac|imac|macmini|mac-pro'; then
    MAC_STUDIO_HOST="$host"
    MAC_STUDIO_IP="$ip"
    break
  fi

  # 첫 번째 다른 기기를 후보로 저장
  if [[ -z "$MAC_STUDIO_HOST" ]]; then
    MAC_STUDIO_HOST="$host"
    MAC_STUDIO_IP="$ip"
  fi
done < <(tailscale status 2>/dev/null | tail -n +2 | grep -v '^$' || true)

if [[ -z "$MAC_STUDIO_HOST" ]]; then
  echo ""
  warn "Mac Studio를 자동으로 찾지 못했습니다."
  echo ""
  echo "Tailscale에 연결된 기기 목록:"
  tailscale status 2>/dev/null || true
  echo ""
  read -r -p "Mac Studio 호스트 이름 (위 목록에서): " MAC_STUDIO_HOST
  MAC_STUDIO_IP="$(tailscale status 2>/dev/null | awk -v h="$MAC_STUDIO_HOST" '$2 == h {print $1; exit}')"
fi

[[ -n "$MAC_STUDIO_HOST" ]] || fail "Mac Studio 호스트를 찾을 수 없습니다."

ok "Mac Studio 발견: $MAC_STUDIO_HOST ($MAC_STUDIO_IP)"

# Mac Studio 사용자명 (같을 가능성 높음)
MAC_USER="${MAC_STUDIO_USER:-$(whoami)}"
read -r -p "Mac Studio 사용자명 [$MAC_USER]: " INPUT_USER
MAC_USER="${INPUT_USER:-$MAC_USER}"

# ── 4. SSH 키 생성 및 등록 ──
info "4/5 SSH 키 설정..."
SSH_KEY="$HOME/.ssh/id_ed25519_macremote"
if [[ ! -f "$SSH_KEY" ]]; then
  ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "macremote-$(whoami)" >/dev/null
  ok "SSH 키 생성 완료"
else
  ok "SSH 키 이미 존재"
fi

SSH_CONFIG="$HOME/.ssh/config"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$SSH_CONFIG"
chmod 600 "$SSH_CONFIG"

if ! grep -q "Host work-mac" "$SSH_CONFIG" 2>/dev/null; then
  cat >> "$SSH_CONFIG" << EOF

# Mac Studio 원격 (자동 생성)
Host work-mac
  HostName $MAC_STUDIO_HOST
  User $MAC_USER
  IdentityFile $SSH_KEY
  AddKeysToAgent yes
EOF
  ok "SSH 설정 추가 (별칭: work-mac)"
else
  ok "SSH 설정 이미 존재"
fi

echo ""
echo -e "${YELLOW}▶ Mac Studio 비밀번호를 한 번 입력하세요 (이후부터는 비밀번호 없이 접속).${NC}"
echo ""

if ssh-copy-id -i "${SSH_KEY}.pub" -o StrictHostKeyChecking=accept-new "$MAC_USER@$MAC_STUDIO_HOST"; then
  ok "SSH 키 등록 완료"
else
  warn "SSH 키 자동 등록 실패. Tailscale SSH로 접속을 시도합니다."
  if tailscale ssh "$MAC_USER@$MAC_STUDIO_HOST" "echo ok" &>/dev/null; then
    ok "Tailscale SSH 접속 가능"
  else
    fail "SSH 연결 실패. Mac Studio에서 setup 스크립트를 먼저 실행했는지 확인하세요."
  fi
fi

# ── 5. 연결 테스트 ──
info "5/5 연결 테스트..."
if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes work-mac "echo connected" &>/dev/null; then
  ok "SSH 연결 성공!"
elif tailscale ssh "$MAC_USER@$MAC_STUDIO_HOST" "echo connected" &>/dev/null; then
  ok "Tailscale SSH 연결 성공!"
else
  warn "자동 테스트 실패 — Mac Studio가 켜져 있는지 확인하세요."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  맥북 설정 완료!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  접속 방법:"
echo ""
echo "  터미널:     ssh work-mac"
echo "  화면 공유:  open vnc://$MAC_STUDIO_HOST"
echo "  Cursor:     Cmd+Shift+P → Remote-SSH: Connect to Host → work-mac"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
