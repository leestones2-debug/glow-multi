#!/usr/bin/env bash
# Mac Studio 원격 접속 설정 검증 스크립트

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo -e "${GREEN}✓${NC} $name"
    return 0
  else
    echo -e "${RED}✗${NC} $name"
    return 1
  fi
}

echo "Mac Studio 원격 접속 설정 검증"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILED=0

check "SSH(원격 로그인) 활성화" "systemsetup -getremotelogin | grep -q 'On'" || FAILED=$((FAILED + 1))
check "SSH 서비스 실행 중" "launchctl print system/com.openssh.sshd 2>/dev/null | grep -q 'state = running'" || \
  check "SSH 포트(22) 수신 대기" "lsof -iTCP:22 -sTCP:LISTEN" || FAILED=$((FAILED + 1))
check "화면 공유 활성화" "launchctl print system/com.apple.screensharing 2>/dev/null | grep -q 'state = running'" || \
  check "VNC 포트(5900) 수신 대기" "lsof -iTCP:5900 -sTCP:LISTEN" || FAILED=$((FAILED + 1))
check "절전 모드 비활성화" "pmset -g | grep -q 'sleep.*0'" || FAILED=$((FAILED + 1))
check "SSH 디렉터리 존재" "test -d ~/.ssh" || FAILED=$((FAILED + 1))

if command -v tailscale &>/dev/null; then
  check "Tailscale 설치됨" "command -v tailscale" || FAILED=$((FAILED + 1))
  if tailscale status &>/dev/null; then
    echo -e "${GREEN}✓${NC} Tailscale 연결됨"
    echo "  Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'N/A')"
  else
    echo -e "${YELLOW}!${NC} Tailscale 설치됨 (연결되지 않음)"
  fi
else
  echo -e "${YELLOW}!${NC} Tailscale 미설치 (선택 사항)"
fi

echo ""
echo "네트워크 정보:"
echo "  호스트 이름: $(scutil --get ComputerName 2>/dev/null || hostname)"
echo "  로컬 IP 주소:"
ifconfig | grep -E "inet " | grep -v 127.0.0.1 | awk '{print "    - " $2}' || echo "    (IP 주소를 찾을 수 없습니다)"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}모든 필수 설정이 완료되었습니다!${NC}"
  exit 0
else
  echo -e "${RED}$FAILED 개의 설정이 완료되지 않았습니다.${NC}"
  echo "setup-mac-studio.sh 스크립트를 다시 실행하거나 README.md를 참고하세요."
  exit 1
fi
