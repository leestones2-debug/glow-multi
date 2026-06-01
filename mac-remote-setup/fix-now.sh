#!/usr/bin/env bash
# Mac Studio 화면공유 강제 수정 (최종)
set -euo pipefail

REAL_USER="${SUDO_USER:-$USER}"
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

echo "Mac Studio 화면공유 강제 수정 시작..."

# 1. 완전히 끄기
echo "[1] 끄는 중..."
command -v sysadminctl &>/dev/null && { sysadminctl -screenSharing off; sysadminctl -remoteAdmin off; } 2>/dev/null || true
launchctl bootout system/com.apple.screensharing 2>/dev/null || true
[[ -x "$KICKSTART" ]] && "$KICKSTART" -deactivate -stop 2>/dev/null || true
sleep 5

# 2. SSH
echo "[2] SSH 켜기..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true

# 3. 원격관리 + 화면공유 (모든 사용자 허용)
echo "[3] 원격관리 + 화면공유 켜기 (모든 사용자 허용)..."
command -v sysadminctl &>/dev/null && { sysadminctl -remoteAdmin on; sysadminctl -screenSharing on; } 2>/dev/null || true

if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -configure -allowAccessFor -allUsers \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || true
fi

launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true

# 4. 절전 방지
echo "[4] 절전 방지..."
pmset -a sleep 0 standby 0 disksleep 0 tcpkeepalive 1 womp 1 displaysleep 30

# 5. 방화벽
echo "[5] 방화벽..."
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true

# 6. Tailscale
echo "[6] Tailscale..."
command -v tailscale &>/dev/null && tailscale up --ssh --hostname=macstudio 2>/dev/null || true

# 7. 검증
sleep 2
VNC_OK="NO"
lsof -iTCP:5900 -sTCP:LISTEN &>/dev/null && VNC_OK="YES"

echo ""
echo "============================================"
if [[ "$VNC_OK" == "YES" ]]; then
  echo " ✅ 성공! 화면공유 준비 완료"
else
  echo " ⚠️  자동 설정 완료 — 아래 수동 확인 필요"
fi
echo "============================================"
echo "  사용자: $REAL_USER"
echo "  VNC포트: $([ "$VNC_OK" == "YES" ] && echo '5900 열림 ✅' || echo '5900 닫힘 ❌ → 수동 확인')"
echo ""
echo "  [수동 확인] 시스템 설정 → 일반 → 공유"
echo "  → 원격관리: 켜짐"
echo "  → 화면공유: 켜짐"
echo ""
echo "  맥북에서: open vnc://100.90.126.19"
echo "  사용자: $REAL_USER / Mac Studio 비밀번호"
echo "============================================"

open "x-apple.systempreferences:com.apple.Sharing-Settings.extension" 2>/dev/null || true
