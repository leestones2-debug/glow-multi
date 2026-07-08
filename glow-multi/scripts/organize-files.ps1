# Windows 바탕화면 + 다운로드 자동 정리
# PowerShell에서 실행:  .\organize-files.ps1

$ErrorActionPreference = "SilentlyContinue"

$Categories = @("문서","이미지","동영상","음악","압축파일","프로젝트","스크립트","설치파일","기타")

$ExtMap = @{
  "문서" = "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","md","hwp","rtf","csv"
  "이미지" = "jpg","jpeg","png","gif","webp","svg","bmp","ico","heic"
  "동영상" = "mp4","mkv","avi","mov","wmv","webm","m4v"
  "음악" = "mp3","wav","flac","aac","m4a","ogg"
  "압축파일" = "zip","rar","7z","tar","gz","bz2","iso"
  "스크립트" = "sh","py","js","ts","jsx","tsx","rb","go","rs","java","c","cpp","php"
  "설치파일" = "exe","msi","dmg","pkg","deb","apk"
}

function Get-Category([string]$fileName) {
  $ext = [System.IO.Path]::GetExtension($fileName).TrimStart('.').ToLower()
  foreach ($cat in $ExtMap.Keys) {
    if ($ExtMap[$cat] -contains $ext) { return $cat }
  }
  return "기타"
}

function Organize-Location([string]$Location, [string]$Label) {
  if (-not (Test-Path $Location)) {
    New-Item -ItemType Directory -Path $Location -Force | Out-Null
  }

  $base = Join-Path $Location "_정리됨"
  foreach ($cat in $Categories) {
    New-Item -ItemType Directory -Path (Join-Path $base $cat) -Force | Out-Null
  }

  Write-Host ""
  Write-Host "📂 $Label 정리 중: $Location"

  $moved = 0

  Get-ChildItem -Path $Location -File | ForEach-Object {
    $cat = Get-Category $_.Name
    $dest = Join-Path $base $cat
    Move-Item -Path $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
    if ($?) {
      Write-Host "   → ${cat}/ : $($_.Name)"
      $moved++
    }
  }

  Get-ChildItem -Path $Location -Directory | Where-Object {
    $_.Name -ne "_정리됨" -and $Categories -notcontains $_.Name
  } | ForEach-Object {
    if ((Test-Path (Join-Path $_.FullName "package.json")) -or (Test-Path (Join-Path $_.FullName ".git"))) {
      $dest = Join-Path $base "프로젝트"
      Move-Item -Path $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
      if ($?) { Write-Host "   → 프로젝트/ : $($_.Name)"; $moved++ }
    }
  }

  Get-ChildItem -Path $Location -Directory | Where-Object {
    $Categories -contains $_.Name
  } | ForEach-Object {
    $dest = Join-Path $base $_.Name
    Get-ChildItem -Path $_.FullName -Force | ForEach-Object {
      Move-Item -Path $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
      if ($?) { $moved++ }
    }
    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host "   ✅ ${Label}: $moved 개 항목 정리 → $base"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$downloads = Join-Path $env:USERPROFILE "Downloads"
if (Test-Path (Join-Path $env:USERPROFILE "다운로드")) {
  $downloads = Join-Path $env:USERPROFILE "다운로드"
}

Organize-Location $desktop "바탕화면"
Organize-Location $downloads "다운로드"

Write-Host ""
Write-Host "✅ 정리 완료! '_정리됨' 폴더를 확인하세요."
