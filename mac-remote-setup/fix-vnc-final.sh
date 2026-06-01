#!/usr/bin/env bash
# Mac Studio VNC 연결 실패 최종 수정
set -euo pipefail

[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "sudo bash fix-vnc-final.sh 로 실행하세요"; exit 1; }

REAL_USER="${SUDO_USER:-$USER}"
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

echo "============================================"
echo " VNC 연결 최종 수정 (Mac Studio)"
echo " 사용자: $REAL_USER"
echo "============================================"

# 완전 초기화
echo "[1] 원격관리 초기화..."
command -v sysadminctl &>/dev/null && { sysadminctl -remoteAdmin off; sysadminctl -screenSharing off; } 2>/dev/null || true
[[ -x "$KICKSTART" ]] && "$KICKSTART" -deactivate -stop 2>/dev/null || true
sleep 5

# 원격관리 + VNC (모든 사용자, 레거시 VNC)
echo "[2] 원격관리 + VNC 활성화..."
if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -configure -allowAccessFor -allUsers \
    -clientopts -setvnclegacy -vnclegacy yes \
    -clientopts -setdirteaching -dirteaching no \
    -restart -agent -privs -all
fi

command -v sysadminctl &>/dev/null && sysadminctl -remoteAdmin on 2>/dev/null || true

# SSH
echo "[3] SSH..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true

# 절전 방지
echo "[4] 절전 방지..."
pmset -a sleep 0 standby 0 disksleep 0 tcpkeepalive 1 womp 1

# 방화벽
echo "[5] 방화벽..."
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /System/Library/CoreServices/RemoteManagement/ARDAgent.app 2>/dev/null || true
$FW --unblockapp /System/Library/CoreServices/RemoteManagement/ARDAgent.app 2>/dev/null || true

# VNC 암호 = Mac Studio 로그인 암호와 동일하게 설정
echo ""
echo ">>> Mac Studio 로그인 암호를 VNC 암호로도 설정합니다."
echo ">>> (맥북 접속 시 같은 암호 사용)"
echo ""
read -rs VNC_PW
echo ""

if [[ -n "$VNC_PW" ]] && [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -configure -client -clientopts -setvncpw -vncpw "$VNC_PW" \
    -setvnclegacy -vnclegacy yes -restart -agent 2>/dev/null || true
fi

sleep 2

# 검증
VNC_OK=false
lsof -iTCP:5900 -sTCP:LISTEN &>/dev/null && VNC_OK=true
SSH_OK=false
systemsetup -getremotelogin 2>/dev/null | grep -qi on && SSH_OK=true

TS_IP="$(tailscale ip -4 2>/dev/null || echo '100.90.126.19')"

echo ""
echo "============================================"
echo " 결과"
echo "============================================"
echo "  VNC (5900):  $([ "$VNC_OK" = true ] && echo '✅ 열림' || echo '❌ 닫힘 → 아래 수동 설정')"
echo "  SSH:         $([ "$SSH_OK" = true ] && echo '✅ 켜짐' || echo '❌')"
echo "  IP:          $TS_IP"
echo "  사용자:      $REAL_USER"
echo "============================================"

if [[ "$VNC_OK" != true ]]; then
  echo ""
  echo ">>> 수동 설정 필요 (Mac Studio):"
  echo "    시스템 설정 → 일반 → 공유 → 원격관리 ⓘ"
  echo "    1. '모든 사용자' 선택"
  echo "    2. 'VNC 뷰어가 암호를 사용하여 화면 제어 가능' ✅ 체크"
  echo ""
fi

echo ">>> 맥북에서 접속:"
echo "    open vnc://$TS_IP"
echo "    사용자: $REAL_USER"
echo "    암호:   (방금 입력한 Mac Studio 암호)"
echo "============================================"

open "x-apple.systempreferences:com.apple.Sharing-Settings.extension" 2>/dev/null || true
