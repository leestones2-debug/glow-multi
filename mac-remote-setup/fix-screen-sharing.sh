#!/usr/bin/env bash
# 화면 공유 연결 실패 시 — Mac Studio에서 실행
# curl -fsSL .../fix-screen-sharing.sh | sudo bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS에서만 실행할 수 있습니다."
[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "sudo로 실행하세요"

REAL_USER="${SUDO_USER:-$USER}"
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

info "화면 공유 설정 초기화 후 재활성화..."
echo ""

# ── 1. 기존 설정 끄기 ──
info "1/5 기존 화면 공유 / 원격관리 끄기..."
if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing off 2>/dev/null || true
  sysadminctl -remoteAdmin off 2>/dev/null || true
fi
launchctl disable system/com.apple.screensharing 2>/dev/null || true
launchctl bootout system/com.apple.screensharing 2>/dev/null || true

if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -deactivate -stop 2>/dev/null || true
fi
ok "기존 설정 비활성화"
sleep 2

# ── 2. 원격 로그인 (SSH) ──
info "2/5 원격 로그인 활성화..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
ok "SSH 활성화"

# ── 3. 화면 공유 + 원격관리 다시 켜기 ──
info "3/5 화면 공유 / 원격관리 재활성화..."
if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing on 2>/dev/null || true
  sysadminctl -remoteAdmin on 2>/dev/null || true
fi

launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl bootstrap system /System/Library/LaunchDaemons/com.apple.screensharing.plist 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true

if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -users "$REAL_USER" -access -on \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || true
fi
ok "화면 공유 재활성화"

# ── 4. VNC 암호 설정 (선택) ──
info "4/5 VNC 암호 설정..."
DEFAULT_VNC_PW="${VNC_PASSWORD:-}"
if [[ -z "$DEFAULT_VNC_PW" ]]; then
  echo ""
  echo -e "${YELLOW}맥북 접속 시 사용할 VNC 암호를 입력하세요 (Mac Studio 로그인 암호와 같아도 됨):${NC}"
  read -rs VNC_PASSWORD
  echo ""
  DEFAULT_VNC_PW="$VNC_PASSWORD"
fi

if [[ -n "$DEFAULT_VNC_PW" ]] && [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -configure -client -clientopts -setvncpw -vncpw "$DEFAULT_VNC_PW" \
    -setvnclegacy -vnclegacy yes -restart -agent 2>/dev/null || true
  ok "VNC 암호 설정 완료"
else
  warn "VNC 암호 설정 건너뜀"
fi

# ── 5. 방화벽 + 절전 ──
info "5/5 방화벽 / 절전 설정..."
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
pmset -a sleep 0 standby 0 disksleep 0 tcpkeepalive 1 womp 1
ok "방화벽 / 절전 설정 완료"

# 상태 확인
echo ""
SS_OK=false
RM_OK=false
launchctl print system/com.apple.screensharing 2>/dev/null | grep -q 'state = running' && SS_OK=true
systemsetup -getremotelogin 2>/dev/null | grep -qi 'on' && RM_OK=true

TS_HOST="$(tailscale status --self 2>/dev/null | head -1 | awk '{print $2}' || echo 'macstudio')"
TS_IP="$(tailscale ip -4 2>/dev/null || echo '')"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  설정 완료!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Mac Studio 사용자: $REAL_USER"
echo "  화면 공유 서비스:  $([ "$SS_OK" = true ] && echo '실행 중 ✓' || echo '확인 필요')"
echo "  원격 로그인:       $([ "$RM_OK" = true ] && echo '켜짐 ✓' || echo '확인 필요')"
echo "  Tailscale:         ${TS_HOST} (${TS_IP})"
echo ""
echo -e "${YELLOW}  맥북(집)에서 다시 시도:${NC}"
echo "    open vnc://${TS_HOST}"
echo ""
echo "  로그인 정보:"
echo "    사용자 이름 → $REAL_USER"
echo "    암호         → Mac Studio 로그인 암호 (또는 위에서 설정한 VNC 암호)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
