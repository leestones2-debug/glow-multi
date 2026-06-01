#!/bin/bash
# Mac Studio — 더블클릭으로 화면공유 재설정
cd "$(dirname "$0")"
REPO="https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup"

osascript <<'EOF'
display dialog "Mac Studio 화면공유를 완전히 재설정합니다.

[시작] 클릭 → Mac Studio 비밀번호 입력
→ 시스템 설정(공유) 화면이 자동으로 열립니다
→ 화면공유/원격관리 켜져 있는지 확인하세요" buttons {"취소", "시작"} default button "시작" with title "Mac Studio 재설정"
if button returned of result is "취소" then return
EOF

osascript -e "do shell script \"curl -fsSL '$REPO/reset-mac-studio.sh' | bash\" with administrator privileges"

osascript -e 'display alert "Mac Studio 재설정 완료!" message "시스템 설정에서 화면공유/원격관리가 켜져 있는지 확인한 뒤, 맥북에서 open vnc://macstudio 를 실행하세요." buttons {"확인"}'

read -p "엔터를 누르면 종료..."
