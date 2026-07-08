#!/bin/bash
# 바탕화면 + 다운로드 폴더 자동 정리
# 사용법:
#   ./organize-files.sh                    # 기본 경로 정리
#   ./organize-files.sh ~/Desktop          # 바탕화면만
#   ./organize-files.sh ~/Desktop ~/Downloads

set -uo pipefail

CATEGORIES=(문서 이미지 동영상 음악 압축파일 프로젝트 스크립트 설치파일 기타)
CATEGORY_NAMES="문서 이미지 동영상 음악 압축파일 프로젝트 스크립트 설치파일 기타"

resolve_dir() {
  local kind="$1"
  if [ "$kind" = "desktop" ]; then
    for d in "$HOME/Desktop" "$HOME/바탕화면" "$HOME/desktop"; do
      [ -d "$d" ] && echo "$d" && return 0
    done
    echo "$HOME/Desktop"
    return 0
  fi
  if [ "$kind" = "downloads" ]; then
    for d in "$HOME/Downloads" "$HOME/다운로드" "$HOME/downloads"; do
      [ -d "$d" ] && echo "$d" && return 0
    done
    echo "$HOME/Downloads"
    return 0
  fi
}

ensure_base() {
  local base="$1"
  mkdir -p "$base"
  for cat in "${CATEGORIES[@]}"; do
    mkdir -p "$base/$cat"
  done
}

is_category_dir() {
  local name="$1"
  [[ " $CATEGORY_NAMES " == *" $name "* ]]
}

is_skip_dir() {
  local name="$1"
  [[ "$name" == "_정리됨" || "$name" == ".Trash" || "$name" == ".." || "$name" == "." ]]
}

classify_file() {
  local file="$1"
  local name lower ext
  name=$(basename "$file")
  lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  ext="${lower##*.}"

  case "$ext" in
    pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|hwp|rtf|odt|ods|csv) echo "문서" ;;
    jpg|jpeg|png|gif|webp|svg|bmp|ico|heic) echo "이미지" ;;
    mp4|mkv|avi|mov|wmv|webm|m4v) echo "동영상" ;;
    mp3|wav|flac|aac|m4a|ogg) echo "음악" ;;
    zip|rar|7z|tar|gz|bz2|xz|iso) echo "압축파일" ;;
    sh|py|js|ts|jsx|tsx|rb|go|rs|java|c|cpp|h|php) echo "스크립트" ;;
    exe|msi|dmg|pkg|deb|rpm|appimage|apk) echo "설치파일" ;;
    *) echo "기타" ;;
  esac
}

organize_location() {
  local location="$1"
  local label="$2"
  local base="$location/_정리됨"

  mkdir -p "$location"
  ensure_base "$base"

  echo ""
  echo "📂 $label 정리 중: $location"

  # 바탕화면/다운로드 루트의 흩어진 파일 분류
  local moved=0
  while IFS= read -r -d '' file; do
    local cat dest
    cat=$(classify_file "$file")
    dest="$base/$cat"
    mkdir -p "$dest"
    if mv -n "$file" "$dest/" 2>/dev/null; then
      echo "   → $cat/ : $(basename "$file")"
      moved=$((moved + 1))
    fi
  done < <(find "$location" -maxdepth 1 -type f -print0 2>/dev/null)

  # 프로젝트 폴더 감지
  for item in "$location"/*; do
    [ -e "$item" ] || continue
    [ -d "$item" ] || continue
    local base_name
    base_name=$(basename "$item")
    is_skip_dir "$base_name" && continue
    is_category_dir "$base_name" && continue
    if [ -f "$item/package.json" ] || [ -d "$item/.git" ] || [ -f "$item/Cargo.toml" ] || [ -f "$item/go.mod" ]; then
      if mv -n "$item" "$base/프로젝트/" 2>/dev/null; then
        echo "   → 프로젝트/ : $base_name"
        moved=$((moved + 1))
      fi
    fi
  done

  # 예전에 바탕화면에 직접 만든 분류 폴더 → _정리됨 안으로 병합
  for item in "$location"/*; do
    [ -e "$item" ] || continue
    [ -d "$item" ] || continue
    local base_name
    base_name=$(basename "$item")
    is_skip_dir "$base_name" && continue
    if is_category_dir "$base_name"; then
      mkdir -p "$base/$base_name"
      shopt -s dotglob nullglob
      for inner in "$item"/*; do
        [ -e "$inner" ] || continue
        mv -n "$inner" "$base/$base_name/" 2>/dev/null && moved=$((moved + 1))
      done
      shopt -u dotglob nullglob
      rmdir "$item" 2>/dev/null || true
    fi
  done

  # 빈 바로가기 폴더 제거
  rmdir "$location/바로가기" 2>/dev/null || true

  echo "   ✅ $label: ${moved}개 항목 정리 → $base"
}

# 인자로 경로 지정 시 해당 경로만, 없으면 바탕화면+다운로드
TARGETS=("$@")
if [ ${#TARGETS[@]} -eq 0 ]; then
  DESKTOP=$(resolve_dir desktop)
  DOWNLOADS=$(resolve_dir downloads)
  mkdir -p "$DESKTOP" "$DOWNLOADS"
  organize_location "$DESKTOP" "바탕화면"
  organize_location "$DOWNLOADS" "다운로드"
else
  for target in "${TARGETS[@]}"; do
    organize_location "$target" "$(basename "$target")"
  done
fi

echo ""
echo "✅ 정리 완료!"
echo "   각 위치의 '_정리됨' 폴더 안에 분류되었습니다."
echo "   구조: 문서 / 이미지 / 동영상 / 음악 / 압축파일 / 프로젝트 / 스크립트 / 설치파일 / 기타"
