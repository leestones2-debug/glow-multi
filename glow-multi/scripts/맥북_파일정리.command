#!/bin/bash
# 맥북 더블클릭용 — 바탕화면 + 다운로드 파일 정리
cd "$(dirname "$0")" || exit 1
exec /bin/bash ./organize-files.sh
