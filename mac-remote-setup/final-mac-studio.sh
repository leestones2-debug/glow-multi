#!/usr/bin/env bash
# Mac Studio 최종 설정 — 이 파일 하나로 전부 처리
set -euo pipefail

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo "~$REAL_USER")"
KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

echo "=========================================="
echo " Mac Studio 최종 설정 시작"
echo " 사용자: $REAL_USER"
echo "=========================================="

# 1. 화면 공유 초기화
echo "[1/8] 화면 공유 초기화..."
command -v sysadminctl &>/dev/null && { sysadminctl -screenSharing off 2>/dev/null || true; sysadminctl -remoteAdmin off 2>/dev/null || true; }
launchctl bootout system/com.apple.screensharing 2>/dev/null || true
[[ -x "$KICKSTART" ]] && "$KICKSTART" -deactivate -stop 2>/dev/null || true
sleep 3

# 2. SSH
echo "[2/8] 원격 로그인(SSH)..."
systemsetup -setremotelogin on 2>/dev/null || true
launchctl enable system/com.openssh.sshd 2>/dev/null || true
launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true

# 3. 화면 공유 + 원격관리
echo "[3/8] 화면 공유 / 원격관리..."
command -v sysadminctl &>/dev/null && { sysadminctl -screenSharing on 2>/dev/null || true; sysadminctl -remoteAdmin on 2>/dev/null || true; }
launchctl enable system/com.apple.screensharing 2>/dev/null || true
launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true
[[ -x "$KICKSTART" ]] && "$KICKSTART" -activate -configure -access -on \
  -users "$REAL_USER" -access -on \
  -clientopts -setvnclegacy -vnclegacy yes \
  -restart -agent -privs -all 2>/dev/null || true

# 4. 절전 방지 (집에서 접속 위해 필수)
echo "[4/8] 절전 방지..."
pmset -a sleep 0 standby 0 hibernatemode 0 disksleep 0
pmset -a tcpkeepalive 1 womp 1 autorestart 1 powernap 0 displaysleep 30
caffeinate -dimsu &>/dev/null &
disown 2>/dev/null || true

# 5. 방화벽
echo "[5/8] 방화벽..."
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
$FW --setglobalstate on 2>/dev/null || true
$FW --add /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true
$FW --unblockapp /usr/libexec/sshd-keygen-wrapper 2>/dev/null || true

# 6. SSH 폴더
echo "[6/8] SSH 준비..."
mkdir -p "$REAL_HOME/.ssh"
chmod 700 "$REAL_HOME/.ssh"
touch "$REAL_HOME/.ssh/authorized_keys"
chmod 600 "$REAL_HOME/.ssh/authorized_keys"
chown -R "$REAL_USER" "$REAL_HOME/.ssh"

# 7. Tailscale
echo "[7/8] Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo -u "$REAL_USER" open -a Tailscale 2>/dev/null || open -a Tailscale 2>/dev/null || true
if ! tailscale status &>/dev/null 2>&1; then
  echo ""
  echo ">>> Tailscale 로그인 창이 열립니다. 같은 계정으로 로그인하세요."
  echo ""
  sudo -u "$REAL_USER" tailscale up --ssh --hostname=macstudio || \
    tailscale up --ssh --hostname=macstudio || true
else
  tailscale up --ssh --hostname=macstudio 2>/dev/null || true
fi

# 8. 검증
echo "[8/8] 검증..."
TS_IP="$(tailscale ip -4 2>/dev/null || echo '미연결')"
LOCAL_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '확인불가')"

cat > "$REAL_HOME/Desktop/맥북에서-할일.txt" << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Mac Studio 설정 완료 ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[맥북에서 할 일]

1. 맥북 터미널에 붙여넣기:

curl -fsSL https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/%EB%A7%A5%EB%B6%81-%EC%97%B0%EA%B2%B0.command -o ~/Desktop/맥북-연결.command && chmod +x ~/Desktop/맥북-연결.command && open ~/Desktop/맥북-연결.command

2. [시작] 클릭
3. Tailscale 같은 계정 로그인
4. Mac Studio 비밀번호 1번 입력

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[집에서 접속]

Tailscale 켜고:
  open vnc://macstudio

로그인:
  사용자: $REAL_USER
  암호:   Mac Studio 비밀번호
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

접속 정보:
  Tailscale: macstudio ($TS_IP)
  로컬 IP:   $LOCAL_IP
  사용자:    $REAL_USER
EOF
chown "$REAL_USER" "$REAL_HOME/Desktop/맥북에서-할일.txt"

echo ""
echo "=========================================="
echo " ✅ Mac Studio 설정 완료!"
echo "=========================================="
echo "  사용자:    $REAL_USER"
echo "  Tailscale: macstudio ($TS_IP)"
echo "  로컬 IP:   $LOCAL_IP"
echo ""
echo "  바탕화면 '맥북에서-할일.txt' 확인"
echo "  → 이제 맥북으로 가서 설정하세요"
echo "=========================================="
echo "DONE"
