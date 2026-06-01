#!/usr/bin/env bash
# Mac Studio 전체 자동 설정 (비대화형)

set -euo pipefail

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo "~$REAL_USER")"
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"
HOST_LABEL="$(scutil --get ComputerName 2>/dev/null | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' || echo 'macstudio')"
TS_HOSTNAME="macstudio"

echo "[1/6] 화면 공유 초기화..."
if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing off 2>/dev/null || true
  sysadminctl -remoteAdmin off 2>/dev/null || true
fi
launchctl bootout system/com.apple.screensharing 2>/dev/null || true
[[ -x "$KICKSTART" ]] && "$KICKSTART" -deactivate -stop 2>/dev/null || true
sleep 2

echo "[2/6] SSH + 화면 공유 활성화..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true

if command -v sysadminctl &>/dev/null; then
  sysadminctl -screenSharing on 2>/dev/null || true
  sysadminctl -remoteAdmin on 2>/dev/null || true
fi
launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true

if [[ -x "$KICKSTART" ]]; then
  "$KICKSTART" -activate -configure -access -on \
    -users "$REAL_USER" -access -on \
    -clientopts -setvnclegacy -vnclegacy yes \
    -restart -agent -privs -all 2>/dev/null || true
fi

echo "[3/6] 절전 / 방화벽..."
pmset -a sleep 0 standby 0 disksleep 0 tcpkeepalive 1 womp 1 displaysleep 30
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true

mkdir -p "$REAL_HOME/.ssh"
chmod 700 "$REAL_HOME/.ssh"
touch "$REAL_HOME/.ssh/authorized_keys"
chmod 600 "$REAL_HOME/.ssh/authorized_keys"
chown -R "$REAL_USER" "$REAL_HOME/.ssh"

echo "[4/6] Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "[5/6] Tailscale 연결 (브라우저 로그인 창이 열립니다)..."
sudo -u "$REAL_USER" open -a Tailscale 2>/dev/null || true
if ! tailscale status &>/dev/null 2>&1; then
  sudo -u "$REAL_USER" tailscale up --ssh --hostname="$TS_HOSTNAME" || \
    tailscale up --ssh --hostname="$TS_HOSTNAME" || true
else
  tailscale up --ssh --hostname="$TS_HOSTNAME" 2>/dev/null || true
fi

echo "[6/6] 완료"
TS_IP="$(tailscale ip -4 2>/dev/null || echo '')"
cat > "$REAL_HOME/맥북에서-할일.txt" << EOF
✅ Mac Studio 설정 완료!

맥북(집)에서 할 일:
1. 아래 파일 다운로드 후 더블클릭
   https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/맥북-연결.command

2. 또는 터미널에 붙여넣기:
   curl -fsSL https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/all-in-one-macbook.sh | bash

접속 정보:
  사용자: $REAL_USER
  호스트: macstudio
  IP:     $TS_IP
EOF
chown "$REAL_USER" "$REAL_HOME/맥북에서-할일.txt"

echo "DONE|$REAL_USER|$TS_IP"
