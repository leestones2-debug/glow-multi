#!/bin/bash
# Mac Studio — 더블클릭 또는 터미널 한 줄로 실행
cd "$(dirname "$0")"
REPO="https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup"

osascript <<'EOF'
display dialog "Mac Studio 최종 설정을 시작합니다.

[시작] 클릭 후:
1. Mac Studio 비밀번호 입력
2. Tailscale 로그인 (맥북과 같은 계정)

끝나면 맥북으로 이동하세요." buttons {"취소", "시작"} default button "시작" with title "Mac Studio 설정"
if button returned of result is "취소" then return
EOF

curl -fsSL "$REPO/final-mac-studio.sh" | osascript -e 'do shell script "bash" with administrator privileges'

open "$HOME/Desktop/맥북에서-할일.txt" 2>/dev/null || true
open -a Tailscale 2>/dev/null || true

osascript -e 'display alert "Mac Studio 설정 완료!" message "바탕화면 '\''맥북에서-할일.txt'\'' 파일을 열어 맥북 설정을 진행하세요." buttons {"확인"} default button "확인"'

read -p "엔터를 누르면 종료..."
