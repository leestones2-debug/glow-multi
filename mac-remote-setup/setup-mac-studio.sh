#!/usr/bin/env bash
# Mac Studio 원격 접속 설정 (회사 Mac Studio에서 실행)
# 사용법: chmod +x setup-mac-studio.sh && ./setup-mac-studio.sh

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
REAL_UID="$(id -u "$REAL_USER")"

info "Mac Studio 원격 접속 설정을 시작합니다 (사용자: $REAL_USER)"
echo ""

# ── 1. 원격 로그인 (SSH) ──
info "1/7 원격 로그인(SSH) 활성화..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
ok "SSH(원격 로그인) 활성화 완료"

# ── 2. 화면 공유 (VNC) ──
info "2/7 화면 공유 활성화..."
launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true

# Remote Management kickstart (화면 공유 + VNC legacy 호환)
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"
if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || warn "kickstart 일부 옵션 적용 실패 (무시 가능)"
fi
ok "화면 공유 활성화 완료"

# ── 3. 절전 방지 (원격 접속 유지) ──
info "3/7 절전 설정 (원격 접속 중 끊김 방지)..."
pmset -a sleep 0
pmset -a standby 0
pmset -a hibernatemode 0
pmset -a disksleep 0
pmset -a tcpkeepalive 1
pmset -a womp 1
pmset -a autorestart 1
pmset -a powernap 0
ok "절전 방지 설정 완료 (디스플레이는 30분 후 꺼짐)"

# 디스플레이만 꺼지게 (시스템은 깨어 있음)
pmset -a displaysleep 30

# ── 4. 방화벽 (SSH + 화면 공유 허용) ──
info "4/7 방화벽 설정..."
/usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/sbin/sshd 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/sbin/sshd 2>/dev/null || true
ok "방화벽 설정 완료"

# ── 5. SSH 키 디렉터리 준비 ──
info "5/7 SSH 설정 준비..."
SSH_DIR="$REAL_HOME/.ssh"
AUTHORIZED_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"
touch "$AUTHORIZED_KEYS"
chmod 600 "$AUTHORIZED_KEYS"
chown -R "$REAL_USER" "$SSH_DIR"
ok "SSH 디렉터리 준비 완료 ($AUTHORIZED_KEYS)"

# ── 6. Tailscale 설치 (선택) ──
info "6/7 Tailscale 설치 확인..."
if command -v tailscale &>/dev/null; then
  ok "Tailscale이 이미 설치되어 있습니다"
  tailscale status 2>/dev/null || warn "Tailscale이 설치되어 있지만 연결되지 않았습니다. 'tailscale up'을 실행하세요."
else
  warn "Tailscale이 설치되어 있지 않습니다."
  echo ""
  read -r -p "Tailscale을 지금 설치하시겠습니까? (y/N): " INSTALL_TAILSCALE
  if [[ "${INSTALL_TAILSCALE,,}" == "y" ]]; then
    info "Tailscale 설치 중..."
    curl -fsSL https://tailscale.com/install.sh | sh
    ok "Tailscale 설치 완료. 'sudo tailscale up' 명령으로 연결하세요."
  else
    info "Tailscale 설치를 건너뜁니다. 나중에 https://tailscale.com/download/mac 에서 설치할 수 있습니다."
  fi
fi

# ── 7. 네트워크 정보 출력 ──
info "7/7 네트워크 정보 확인..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Mac Studio 설정이 완료되었습니다!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Mac Studio 정보:"
echo "  • 호스트 이름: $(scutil --get ComputerName 2>/dev/null || hostname)"
echo "  • 로컬 IP 주소:"
ifconfig | grep -E "inet " | grep -v 127.0.0.1 | awk '{print "    - " $2}' || echo "    (IP 주소를 찾을 수 없습니다)"
echo ""
echo "  • SSH 접속: ssh $REAL_USER@<IP주소>"
echo "  • 화면 공유: vnc://<IP주소>"
echo ""
if command -v tailscale &>/dev/null && tailscale status &>/dev/null; then
  echo "  • Tailscale IP:"
  tailscale ip -4 2>/dev/null | awk '{print "    - " $0}' || true
fi
echo ""
echo "📝 다음 단계 (MacBook에서 설정):"
echo "  1. Tailscale 또는 회사 VPN 설치 및 연결"
echo "  2. SSH 키 생성 및 Mac Studio에 등록"
echo "  3. 원격 접속 테스트"
echo ""
echo "자세한 내용은 README.md 파일을 참고하세요."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
