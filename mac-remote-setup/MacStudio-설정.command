#!/bin/bash
# Mac Studio에서 이 파일을 더블클릭하세요
cd "$(dirname "$0")"

REPO="https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup"

osascript <<'APPLESCRIPT'
display dialog "Mac Studio 원격 설정을 시작합니다.

[확인] 클릭 후:
1. 관리자 비밀번호 입력 (Mac Studio 로그인 암호)
2. Tailscale 로그인 창에서 클릭만 하면 됩니다

※ 맥북은 나중에 '맥북-연결.command' 실행" buttons {"취소", "시작"} default button "시작" with title "Mac Studio 설정"
if button returned of result is "취소" then return
APPLESCRIPT

RESULT=$(osascript -e "do shell script \"curl -fsSL '$REPO/all-in-one-studio.sh' | bash\" with administrator privileges" 2>&1) || {
  osascript -e 'display alert "설정 실패" message "터미널에서 다시 시도해 주세요." as critical'
  read -p "엔터로 종료..."
  exit 1
}

USER=$(echo "$RESULT" | grep "^DONE|" | tail -1 | cut -d'|' -f2)
IP=$(echo "$RESULT" | grep "^DONE|" | tail -1 | cut -d'|' -f3)

open -a Tailscale 2>/dev/null || true

osascript -e "display alert \"Mac Studio 설정 완료!\" message \"이제 집 맥북에서 '맥북-연결.command' 파일을 더블클릭하세요.

사용자: ${USER}
호스트: macstudio
IP: ${IP}\" buttons {\"확인\"} default button \"확인\""

open "$HOME/맥북에서-할일.txt" 2>/dev/null || true
read -p "엔터를 누르면 종료합니다..."
