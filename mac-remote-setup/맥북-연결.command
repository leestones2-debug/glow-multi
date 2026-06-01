#!/bin/bash
# 집 맥북에서 이 파일을 더블클릭하세요
cd "$(dirname "$0")"

REPO="https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup"

osascript <<'APPLESCRIPT'
display dialog "맥북에서 Mac Studio에 연결합니다.

[시작] 클릭 후:
1. Tailscale 로그인 (처음만, 같은 계정)
2. Mac Studio 비밀번호 1번 입력
3. Mac Studio 화면이 자동으로 열립니다" buttons {"취소", "시작"} default button "시작" with title "맥북 연결"
if button returned of result is "취소" then return
APPLESCRIPT

bash <(curl -fsSL "$REPO/all-in-one-macbook.sh") || {
  osascript -e 'display alert "연결 실패" message "Mac Studio가 켜져 있고 Tailscale이 Connected인지 확인하세요." as critical'
}

read -p "엔터를 누르면 종료합니다..."
