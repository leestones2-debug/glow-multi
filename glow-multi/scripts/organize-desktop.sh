#!/bin/bash
# 바탕화면 파일 자동 정리 스크립트
# 사용법: ./organize-desktop.sh [바탕화면_경로]
# 기본 경로: ~/Desktop (없으면 ~/바탕화면)

set -euo pipefail

DESKTOP="${1:-}"
if [ -z "$DESKTOP" ]; then
  if [ -d "$HOME/Desktop" ]; then
    DESKTOP="$HOME/Desktop"
  elif [ -d "$HOME/바탕화면" ]; then
    DESKTOP="$HOME/바탕화면"
  else
    DESKTOP="$HOME/Desktop"
    mkdir -p "$DESKTOP"
    echo "바탕화면 폴더 생성: $DESKTOP"
  fi
fi

# 정리용 하위 폴더
FOLDERS=(
  "문서"
  "이미지"
  "동영상"
  "음악"
  "압축파일"
  "프로젝트"
  "스크립트"
  "기타"
)

for folder in "${FOLDERS[@]}"; do
  mkdir -p "$DESKTOP/$folder"
done

# 확장자별 이동 규칙
move_by_ext() {
  local ext="$1"
  local dest="$2"
  find "$DESKTOP" -maxdepth 1 -type f -iname "*.$ext" -exec mv -n {} "$DESKTOP/$dest/" \; 2>/dev/null || true
}

move_by_ext "pdf" "문서"
move_by_ext "doc" "문서"
move_by_ext "docx" "문서"
move_by_ext "xls" "문서"
move_by_ext "xlsx" "문서"
move_by_ext "ppt" "문서"
move_by_ext "pptx" "문서"
move_by_ext "txt" "문서"
move_by_ext "md" "문서"
move_by_ext "hwp" "문서"

move_by_ext "jpg" "이미지"
move_by_ext "jpeg" "이미지"
move_by_ext "png" "이미지"
move_by_ext "gif" "이미지"
move_by_ext "webp" "이미지"
move_by_ext "svg" "이미지"

move_by_ext "mp4" "동영상"
move_by_ext "mkv" "동영상"
move_by_ext "avi" "동영상"
move_by_ext "mov" "동영상"

move_by_ext "mp3" "음악"
move_by_ext "wav" "음악"
move_by_ext "flac" "음악"

move_by_ext "zip" "압축파일"
move_by_ext "rar" "압축파일"
move_by_ext "7z" "압축파일"
move_by_ext "tar" "압축파일"
move_by_ext "gz" "압축파일"

move_by_ext "sh" "스크립트"
move_by_ext "py" "스크립트"
move_by_ext "js" "스크립트"
move_by_ext "ts" "스크립트"

# 프로젝트 폴더 감지 (package.json, .git 등)
for item in "$DESKTOP"/*; do
  [ -d "$item" ] || continue
  base=$(basename "$item")
  [[ " ${FOLDERS[*]} " == *" $base "* ]] && continue
  if [ -f "$item/package.json" ] || [ -d "$item/.git" ]; then
    mv -n "$item" "$DESKTOP/프로젝트/" 2>/dev/null || true
  fi
done

# 남은 파일 → 기타
find "$DESKTOP" -maxdepth 1 -type f -exec mv -n {} "$DESKTOP/기타/" \; 2>/dev/null || true

echo "✅ 바탕화면 정리 완료: $DESKTOP"
echo "   문서 / 이미지 / 동영상 / 음악 / 압축파일 / 프로젝트 / 스크립트 / 기타"
