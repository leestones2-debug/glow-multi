#!/usr/bin/env bash
# Mac Studio 화면 공유 + 원격 로그인 활성화
# 사용: curl -fsSL .../enable-sharing.sh | sudo bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
fail() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS에서만 실행할 수 있습니다."
[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "sudo로 실행하세요: sudo bash enable-sharing.sh"

REAL_USER="${SUDO_USER:-$USER}"

info "화면 공유 및 원격 로그인 설정 중..."

# macOS 13+ 공식 방법
if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing on 2>/dev/null || true
  sysadminctl -remoteAdmin on 2>/dev/null || true
  ok "sysadminctl: 화면 공유 / 원격 관리 활성화"
fi

# 원격 로그인 (SSH)
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
ok "원격 로그인(SSH) 활성화"

# 화면 공유 서비스
launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true
ok "화면 공유 서비스 시작"

# VNC 레거시 + Remote Management
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"
if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || true
  ok "VNC / Remote Management 설정"
fi

# 방화벽에서 허용
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --add /usr/sbin/sshd 2>/dev/null || true
$FW --unblockapp /usr/sbin/sshd 2>/dev/null || true
ok "방화벽 허용"

# 절전 방지 (원격 중 끊김 방지)
pmset -a sleep 0 standby 0 disksleep 0 tcpkeepalive 1 womp 1
ok "절전 방지"

TS_HOST="$(tailscale status --self 2>/dev/null | head -1 | awk '{print $2}' || echo 'macstudio')"
TS_IP="$(tailscale ip -4 2>/dev/null || echo '')"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  화면 공유 설정 완료!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Mac Studio 사용자: $REAL_USER"
echo "  Tailscale 이름:    ${TS_HOST}"
[[ -n "$TS_IP" ]] && echo "  Tailscale IP:      $TS_IP"
echo ""
echo "  맥북에서 접속:"
echo "    open vnc://${TS_HOST}"
echo "    또는 open vnc://${TS_IP}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
