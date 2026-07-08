#!/bin/bash
# 맥북 바탕화면 + 다운로드 정리 (더블클릭 실행용)
# 이 파일을 바탕화면에 두고 더블클릭하세요.

cd "$(dirname "$0")" 2>/dev/null || true

echo "======================================"
echo "  맥북 바탕화면 / 다운로드 정리 시작"
echo "======================================"

DESKTOP="$HOME/Desktop"
DOWNLOADS="$HOME/Downloads"
[ -d "$HOME/바탕화면" ] && DESKTOP="$HOME/바탕화면"
[ -d "$HOME/다운로드" ] && DOWNLOADS="$HOME/다운로드"

# ── 분류 함수 ──
classify() {
  local name="$1"
  local lower ext
  lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  ext="${lower##*.}"

  # 스크린샷, 카카오톡 사진
  [[ "$name" == 스크린샷* ]] && echo "이미지" && return
  [[ "$lower" == screenshot* ]] && echo "이미지" && return
  [[ "$lower" == kakaotalk* ]] && echo "이미지" && return
  [[ "$lower" == photo* ]] && echo "이미지" && return

  case "$ext" in
    pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|hwp|pages|numbers|key) echo "문서" ;;
    jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|svg) echo "이미지" ;;
    mp4|mov|mkv|avi|m4v|webm) echo "동영상" ;;
    mp3|wav|m4a|aac|flac) echo "음악" ;;
    zip|rar|7z|tar|gz|dmg|pkg) echo "압축파일" ;;
    sh|py|js|ts|swift|command) echo "스크립트" ;;
    *) echo "기타" ;;
  esac
}

safe_mv() {
  local src="$1" dest="$2" name="$3"
  [ -z "$name" ] && name=$(basename "$src")
  if [ -e "$dest/$name" ]; then
    local i=1
    while [ -e "$dest/${name%.*}_$i.${name##*.}" ]; do i=$((i+1)); done
    name="${name%.*}_$i.${name##*.}"
  fi
  mv "$src" "$dest/$name" 2>/dev/null
}

organize() {
  local DIR="$1"
  local LABEL="$2"
  local BASE="$DIR/_정리됨"
  local count=0

  [ ! -d "$DIR" ] && mkdir -p "$DIR"

  for sub in 문서 이미지 동영상 음악 압축파일 폴더 프로젝트 기타; do
    mkdir -p "$BASE/$sub"
  done

  echo ""
  echo "📂 $LABEL: $DIR"

  # 파일 정리
  for f in "$DIR"/*; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    [[ "$name" == ".DS_Store" ]] && continue
    cat=$(classify "$name")
    safe_mv "$f" "$BASE/$cat" "$name" && count=$((count+1)) && echo "   ✓ $name → $cat"
  done

  # 폴더 정리 (_정리됨 제외)
  for d in "$DIR"/*; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    [[ "$name" == "_정리됨" ]] && continue
    # 프로젝트 폴더
    if [ -f "$d/package.json" ] || [ -d "$d/.git" ]; then
      safe_mv "$d" "$BASE/프로젝트" "$name" && count=$((count+1)) && echo "   ✓ $name → 프로젝트"
    else
      safe_mv "$d" "$BASE/폴더" "$name" && count=$((count+1)) && echo "   ✓ $name → 폴더"
    fi
  done

  echo "   → ${count}개 정리 완료"
}

organize "$DESKTOP" "바탕화면"
organize "$DOWNLOADS" "다운로드"

echo ""
echo "✅ 정리 끝!  바탕화면/_정리됨  폴더를 확인하세요."
open "$DESKTOP/_정리됨" 2>/dev/null
osascript -e 'display dialog "바탕화면 정리 완료!\n\n바탕화면/_정리됨 폴더를 확인하세요." buttons {"확인"} default button 1 with title "파일 정리"' 2>/dev/null

read -r -p "엔터를 누르면 닫힙니다..."
