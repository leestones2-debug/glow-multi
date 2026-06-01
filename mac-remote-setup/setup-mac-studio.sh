#!/usr/bin/env bash
# Mac Studio 원격 접속 설정 (회사 Mac Studio에서 실행)

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
  fail "이 스크립트는 macOS(Mac Studio)에서만 실행할 수 있습니다."
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  fail "sudo 권한이 필요합니다. 실행: sudo ./setup-mac-studio.sh"
fi

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo "~$REAL_USER")"
HOST_LABEL="$(scutil --get ComputerName 2>/dev/null | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' || echo 'mac-studio')"
TS_HOSTNAME="${TAILSCALE_HOSTNAME:-work-mac-${HOST_LABEL}}"

info "Mac Studio 원격 접속 설정 시작 (사용자: $REAL_USER)"
echo ""

# ── 1. SSH ──
info "1/6 SSH(원격 로그인)..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
ok "SSH 활성화"

# ── 2. 화면 공유 ──
info "2/6 화면 공유..."
launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"
if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || true
fi
ok "화면 공유 활성화"

# ── 3. 절전 방지 ──
info "3/6 절전 방지..."
pmset -a sleep 0 standby 0 hibernatemode 0 disksleep 0
pmset -a tcpkeepalive 1 womp 1 autorestart 1 powernap 0 displaysleep 30
ok "절전 방지 완료"

# ── 4. 방화벽 ──
info "4/6 방화벽..."
/usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/sbin/sshd 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/sbin/sshd 2>/dev/null || true
ok "방화벽 설정 완료"

# ── 5. SSH 디렉터리 ──
info "5/6 SSH 준비..."
SSH_DIR="$REAL_HOME/.ssh"
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"
touch "$SSH_DIR/authorized_keys"
chmod 600 "$SSH_DIR/authorized_keys"
chown -R "$REAL_USER" "$SSH_DIR"
ok "SSH 준비 완료"

# ── 6. Tailscale (자동) ──
info "6/6 Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
ok "Tailscale 설치됨"

if ! tailscale status &>/dev/null 2>&1; then
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}  브라우저가 열립니다 → Google/Apple 계정으로 로그인하세요${NC}"
  echo -e "${YELLOW}  (맥북에서도 같은 계정으로 로그인해야 합니다)${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  sudo -u "$REAL_USER" tailscale up --ssh --hostname="$TS_HOSTNAME" || \
    tailscale up --ssh --hostname="$TS_HOSTNAME" || \
    warn "Tailscale 로그인 필요 — 나중에 'sudo tailscale up --ssh --hostname=$TS_HOSTNAME' 실행"
else
  tailscale up --ssh --hostname="$TS_HOSTNAME" 2>/dev/null || true
  ok "Tailscale 연결됨"
fi

TS_IP="$(tailscale ip -4 2>/dev/null || echo '연결 후 확인')"

# 연결 정보 저장
INFO_FILE="$REAL_HOME/mac-remote-info.txt"
cat > "$INFO_FILE" << EOF
Mac Studio 원격 접속 정보
========================
사용자:     $REAL_USER
호스트명:   $TS_HOSTNAME
Tailscale:  $TS_IP
설정일:     $(date)

맥북에서 실행할 명령:
curl -fsSL https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/install-macbook.sh | bash
EOF
chown "$REAL_USER" "$INFO_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  Mac Studio 설정 완료!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  사용자:     $REAL_USER"
echo "  Tailscale:  $TS_HOSTNAME ($TS_IP)"
echo ""
echo -e "${YELLOW}  이제 집 맥북 터미널에서 아래 명령을 붙여넣으세요:${NC}"
echo ""
echo '  curl -fsSL https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/install-macbook.sh | bash'
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
