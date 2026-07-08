#!/bin/bash
# 바탕화면 + 다운로드 폴더 자동 정리 (macOS / Linux)
# Mac: scripts/맥북_파일정리.command 더블클릭

set -uo pipefail

CATEGORIES=(문서 이미지 동영상 음악 압축파일 프로젝트 폴더 스크립트 설치파일 기타)
CATEGORY_NAMES="문서 이미지 동영상 음악 압축파일 프로젝트 폴더 스크립트 설치파일 기타"

# macOS 한글 경로 지원
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
  if [ "$kind" = "documents" ]; then
    for d in "$HOME/Documents" "$HOME/문서"; do
      [ -d "$d" ] && echo "$d" && return 0
    done
    echo "$HOME/Documents"
    return 0
  fi
  if [ "$kind" = "pictures" ]; then
    for d in "$HOME/Pictures" "$HOME/사진"; do
      [ -d "$d" ] && echo "$d" && return 0
    done
    echo "$HOME/Pictures"
    return 0
  fi
}

clear_mac_recents() {
  if [ "$(uname)" != "Darwin" ]; then return 0; fi
  echo ""
  echo "🕐 Finder 최근 항목 목록 정리 중..."
  local recent_dir="$HOME/Library/Application Support/com.apple.sharedfilelist"
  if [ -d "$recent_dir" ]; then
    rm -f "$recent_dir"/com.apple.LSSharedFileList.RecentDocuments.sfl2 2>/dev/null
    rm -f "$recent_dir"/com.apple.LSSharedFileList.RecentApplications.sfl2 2>/dev/null
    rm -f "$recent_dir"/com.apple.LSSharedFileList.RecentServers.sfl2 2>/dev/null
    find "$recent_dir" -name "*Recent*" -type f -delete 2>/dev/null || true
  fi
  defaults delete com.apple.finder FXRecentFolders 2>/dev/null || true
  defaults delete com.apple.finder FXRecentTags 2>/dev/null || true
  killall Finder 2>/dev/null || true
  echo "   ✓ 최근 항목 목록 초기화 완료"
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
  [[ "$name" == "_정리됨" || "$name" == ".Trash" || "$name" == ".trash" ]]
}

is_skip_file() {
  local name="$1"
  [[ "$name" == ".DS_Store" || "$name" == ".localized" || "$name" == "desktop.ini" || "$name" == "Thumbs.db" ]]
}

# macOS BSD mv는 -n 미지원 → 안전 이동
safe_mv() {
  local src="$1"
  local dest_dir="$2"
  local name dest_path

  [ -e "$src" ] || return 1
  name=$(basename "$src")
  dest_path="$dest_dir/$name"

  if [ -e "$dest_path" ]; then
    local stem ext candidate n=1
    if [[ "$name" == *.* && "$name" != .* ]]; then
      stem="${name%.*}"
      ext="${name##*.}"
      candidate="${stem}_${n}.${ext}"
    else
      candidate="${name}_${n}"
    fi
    while [ -e "$dest_dir/$candidate" ]; do
      n=$((n + 1))
      if [[ "$name" == *.* && "$name" != .* ]]; then
        candidate="${stem}_${n}.${ext}"
      else
        candidate="${name}_${n}"
      fi
    done
    dest_path="$dest_dir/$candidate"
  fi

  mv "$src" "$dest_path" 2>/dev/null
}

classify_file() {
  local file="$1"
  local name lower ext
  name=$(basename "$file")
  lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  ext="${lower##*.}"

  # macOS 스크린샷 / 카카오톡 사진
  if [[ "$name" == 스크린샷* ]] || [[ "$lower" == screenshot* ]] || [[ "$lower" == kakaotalk* ]]; then
    echo "이미지"
    return
  fi

  case "$ext" in
    pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|hwp|rtf|odt|ods|csv|pages|numbers|key) echo "문서" ;;
    jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif|tiff|tif) echo "이미지" ;;
    mp4|mkv|avi|mov|wmv|webm|m4v) echo "동영상" ;;
    mp3|wav|flac|aac|m4a|ogg) echo "음악" ;;
    zip|rar|7z|tar|gz|bz2|xz|iso) echo "압축파일" ;;
    sh|py|js|ts|jsx|tsx|rb|go|rs|java|c|cpp|h|php|swift|m|mm) echo "스크립트" ;;
    exe|msi|dmg|pkg|deb|rpm|appimage|apk) echo "설치파일" ;;
    *) echo "기타" ;;
  esac
}

organize_location() {
  local location="$1"
  local label="$2"
  local base="$location/_정리됨"
  local moved=0

  mkdir -p "$location"
  ensure_base "$base"

  echo ""
  echo "📂 $label 정리 중: $location"

  # 루트 파일 정리
  while IFS= read -r -d '' file; do
    local cat dest name
    name=$(basename "$file")
    is_skip_file "$name" && continue
    cat=$(classify_file "$file")
    dest="$base/$cat"
    mkdir -p "$dest"
    if safe_mv "$file" "$dest"; then
      echo "   → $cat/ : $name"
      moved=$((moved + 1))
    fi
  done < <(find "$location" -maxdepth 1 -type f -print0 2>/dev/null)

  # .app 번들 → 설치파일
  for item in "$location"/*.app; do
    [ -e "$item" ] || continue
    mkdir -p "$base/설치파일"
    if safe_mv "$item" "$base/설치파일"; then
      echo "   → 설치파일/ : $(basename "$item")"
      moved=$((moved + 1))
    fi
  done

  # 일반 폴더 → _정리됨/폴더 (클로드자료, 3D북 등)
  for item in "$location"/*; do
    [ -e "$item" ] || continue
    [ -d "$item" ] || continue
    local base_name
    base_name=$(basename "$item")
    is_skip_dir "$base_name" && continue
    is_category_dir "$base_name" && continue
    [[ "$base_name" == "Photos Library.photoslibrary" ]] && continue
    [[ "$base_name" == "Photo Booth Library" ]] && continue
    if [ -f "$item/package.json" ] || [ -d "$item/.git" ] || [ -f "$item/Cargo.toml" ] || [ -f "$item/go.mod" ]; then
      mkdir -p "$base/프로젝트"
      if safe_mv "$item" "$base/프로젝트"; then
        echo "   → 프로젝트/ : $base_name"
        moved=$((moved + 1))
      fi
    else
      mkdir -p "$base/폴더"
      if safe_mv "$item" "$base/폴더"; then
        echo "   → 폴더/ : $base_name"
        moved=$((moved + 1))
      fi
    fi
  done

  # 예전 분류 폴더 병합 (이미 위에서 일반 폴더 처리됨 — 카테고리 폴더만)
  for item in "$location"/*; do
    [ -e "$item" ] || continue
    [ -d "$item" ] || continue
    local base_name inner
    base_name=$(basename "$item")
    is_skip_dir "$base_name" && continue
    if is_category_dir "$base_name"; then
      mkdir -p "$base/$base_name"
      for inner in "$item"/*; do
        [ -e "$inner" ] || continue
        safe_mv "$inner" "$base/$base_name" && moved=$((moved + 1))
      done
      rmdir "$item" 2>/dev/null || true
    fi
  done

  # .DS_Store 정리 (기타로 이동하지 않고 삭제)
  find "$location" -maxdepth 1 -name '.DS_Store' -delete 2>/dev/null || true

  echo "   ✅ $label: ${moved}개 항목 정리 → $base"
}

# ── 실행 ──
TARGETS=("$@")
if [ ${#TARGETS[@]} -eq 0 ]; then
  DESKTOP=$(resolve_dir desktop)
  DOWNLOADS=$(resolve_dir downloads)
  DOCUMENTS=$(resolve_dir documents)
  PICTURES=$(resolve_dir pictures)
  mkdir -p "$DESKTOP" "$DOWNLOADS"
  organize_location "$DESKTOP" "바탕화면"
  organize_location "$DOWNLOADS" "다운로드"
  [ -d "$DOCUMENTS" ] && organize_location "$DOCUMENTS" "문서 폴더"
  [ -d "$PICTURES" ] && organize_location "$PICTURES" "사진 폴더"
  for ss in "$PICTURES/스크린샷" "$PICTURES/Screenshots" "$HOME/스크린샷"; do
    [ -d "$ss" ] && organize_location "$ss" "스크린샷 폴더"
  done
  clear_mac_recents
else
  for target in "${TARGETS[@]}"; do
    organize_location "$target" "$(basename "$target")"
  done
fi

echo ""
echo "✅ 정리 완료!"
echo "   바탕화면·다운로드·문서·사진 의 _정리됨 폴더와 최근 항목을 확인하세요."

# macOS: Finder에서 결과 폴더 열기
if [ "$(uname)" = "Darwin" ]; then
  DESKTOP=$(resolve_dir desktop)
  DOWNLOADS=$(resolve_dir downloads)
  open "$DESKTOP/_정리됨" 2>/dev/null || true
  open "$DOWNLOADS/_정리됨" 2>/dev/null || true
  osascript -e 'display notification "바탕화면과 다운로드 정리가 완료되었습니다" with title "파일 정리"' 2>/dev/null || true
fi
