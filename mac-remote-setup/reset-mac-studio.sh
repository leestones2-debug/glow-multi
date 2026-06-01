#!/usr/bin/env bash
# Mac Studio 화면공유 완전 재설정
set -euo pipefail

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo "~$REAL_USER")"
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

echo "============================================"
echo " Mac Studio 화면공유 완전 재설정"
echo " 사용자: $REAL_USER"
echo "============================================"

# ── 1. 전부 끄기 ──
echo "[1/6] 기존 설정 끄는 중..."
if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing off 2>/dev/null || true
  sysadminctl -remoteAdmin off 2>/dev/null || true
fi
launchctl bootout system/com.apple.screensharing 2>/dev/null || true
launchctl disable system/com.apple.screensharing 2>/dev/null || true
[[ -x "$KICKSTART" ]] && "$KICKSTART" -deactivate -stop 2>/dev/null || true
sleep 3
echo "    → 끄기 완료"

# ── 2. SSH ──
echo "[2/6] 원격 로그인(SSH) 켜기..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
echo "    → SSH 켜짐"

# ── 3. 화면공유 + 원격관리 켜기 ──
echo "[3/6] 화면공유 / 원격관리 켜기..."
if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing on 2>/dev/null || true
  sysadminctl -remoteAdmin on 2>/dev/null || true
fi

launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl bootstrap system /System/Library/LaunchDaemons/com.apple.screensharing.plist 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true

if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -users "$REAL_USER" -access -on -privs -all \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || true
fi
echo "    → 화면공유 켜짐"

# ── 4. 절전 방지 ──
echo "[4/6] 절전 방지..."
pmset -a sleep 0 standby 0 hibernatemode 0 disksleep 0
pmset -a tcpkeepalive 1 womp 1 autorestart 1 powernap 0 displaysleep 30
echo "    → 절전 방지 완료"

# ── 5. 방화벽 ──
echo "[5/6] 방화벽 허용..."
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --add /System/Library/CoreServices/RemoteManagement/ARDAgent.app 2>/dev/null || true
$FW --unblockapp /System/Library/CoreServices/RemoteManagement/ARMAgent.app 2>/dev/null || true
$FW --unblockapp /System/Library/CoreServices/RemoteManagement/ARDAgent.app 2>/dev/null || true
echo "    → 방화벽 설정 완료"

# ── 6. Tailscale ──
echo "[6/6] Tailscale 확인..."
if command -v tailscale &>/dev/null; then
  tailscale up --ssh --hostname=macstudio 2>/dev/null || true
  TS_IP="$(tailscale ip -4 2>/dev/null || echo '미연결')"
else
  TS_IP="Tailscale 앱에서 Connected 확인"
fi
sudo -u "$REAL_USER" open -a Tailscale 2>/dev/null || true

# ── 검증 ──
SS_RUNNING=false
lsof -iTCP:5900 -sTCP:LISTEN &>/dev/null && SS_RUNNING=true

SSH_ON=false
systemsetup -getremotelogin 2>/dev/null | grep -qi 'on' && SSH_ON=true

echo ""
echo "============================================"
echo " 설정 결과"
echo "============================================"
echo "  화면공유(5900포트): $([ "$SS_RUNNING" = true ] && echo '✅ 실행 중' || echo '❌ 확인 필요')"
echo "  SSH:                $([ "$SSH_ON" = true ] && echo '✅ 켜짐' || echo '❌ 확인 필요')"
echo "  Tailscale:          macstudio ($TS_IP)"
echo "  사용자:             $REAL_USER"
echo "============================================"

# 공유 설정 화면 자동 열기 (수동 확인용)
sudo -u "$REAL_USER" open "x-apple.systempreferences:com.apple.Sharing-Settings.extension" 2>/dev/null || \
  sudo -u "$REAL_USER" open "/System/Applications/System Settings.app" 2>/dev/null || true

echo ""
echo ">>> 시스템 설정 → 공유 화면이 열립니다."
echo ">>> '화면 공유' 와 '원격 관리' 가 파란색(켜짐)인지 확인하세요."
echo ""
echo ">>> 맥북에서 접속:"
echo "    open vnc://macstudio"
echo "    사용자: $REAL_USER"
echo "    암호:   Mac Studio 로그인 비밀번호"
echo "============================================"
