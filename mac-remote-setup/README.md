# Mac Studio 원격 접속 설정 가이드

집 맥북에서 회사 Mac Studio에 원격으로 접속하기 위한 설정 가이드입니다.

## Mac Studio 설정 (회사에서 실행)

### 1. 자동 설정 스크립트 실행

```bash
# 스크립트 다운로드 또는 복사
cd ~/Downloads  # 또는 원하는 디렉터리

# 실행 권한 부여
chmod +x setup-mac-studio.sh verify-mac-studio.sh

# 설정 실행 (관리자 권한 필요)
sudo ./setup-mac-studio.sh
```

### 2. 설정 검증

```bash
./verify-mac-studio.sh
```

### 3. Tailscale 연결 (선택, 권장)

Tailscale을 사용하면 VPN 없이도 집에서 Mac Studio에 접속할 수 있습니다.

```bash
# Tailscale 설치 (setup-mac-studio.sh에서 설치하지 않은 경우)
curl -fsSL https://tailscale.com/install.sh | sh

# Tailscale 연결
sudo tailscale up

# Tailscale IP 확인
tailscale ip -4
```

**주의:** 회사 보안 정책에 따라 Tailscale 사용이 제한될 수 있습니다. IT팀에 확인하세요.

## MacBook 설정 (집에서 실행)

### 1. Tailscale 또는 VPN 설치

**Tailscale 사용 (권장):**
```bash
# Tailscale 설치
brew install tailscale
# 또는 https://tailscale.com/download/mac 에서 다운로드

# Tailscale 연결
sudo tailscale up
```

**회사 VPN 사용:**
- IT팀에서 제공한 VPN 클라이언트 설치 및 연결

### 2. SSH 키 생성 및 등록

```bash
# SSH 키 생성 (이미 있는 경우 건너뛰기)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Mac Studio에 공개키 복사
ssh-copy-id username@mac-studio-ip
# 또는 Tailscale IP 사용: ssh-copy-id username@100.x.x.x
```

### 3. 원격 접속 테스트

**SSH 접속:**
```bash
ssh username@mac-studio-ip
# 또는 Tailscale IP: ssh username@100.x.x.x
```

**화면 공유:**
```bash
# Finder에서
# 이동 → 서버에 연결 → vnc://mac-studio-ip
# 또는 Tailscale IP: vnc://100.x.x.x
```

**VS Code / Cursor 원격 개발:**
1. Remote - SSH 확장 설치
2. `Cmd+Shift+P` → "Remote-SSH: Connect to Host"
3. Mac Studio IP 입력

## 문제 해결

### SSH 접속이 안 될 때

1. Mac Studio에서 SSH가 활성화되어 있는지 확인:
   ```bash
   systemsetup -getremotelogin
   ```

2. 방화벽 설정 확인:
   ```bash
   /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
   ```

3. 네트워크 연결 확인:
   ```bash
   ping mac-studio-ip
   ```

### 화면 공유가 안 될 때

1. Mac Studio에서 화면 공유가 활성화되어 있는지 확인:
   ```bash
   launchctl print system/com.apple.screensharing
   ```

2. VNC 포트 확인:
   ```bash
   lsof -iTCP:5900 -sTCP:LISTEN
   ```

### Tailscale 연결이 안 될 때

1. Mac Studio와 MacBook 모두 Tailscale에 로그인되어 있는지 확인
2. 같은 Tailnet에 속해 있는지 확인:
   ```bash
   tailscale status
   ```

## 보안 주의사항

- SSH 키 인증 사용 권장 (비밀번호 인증보다 안전)
- Tailscale 사용 시 회사 보안 정책 확인 필요
- 공용 Wi-Fi에서는 VPN 사용 권장
- 정기적으로 시스템 업데이트 유지

## 추가 리소스

- [Apple 원격 관리 가이드](https://support.apple.com/guide/remote-desktop/)
- [Tailscale 문서](https://tailscale.com/kb/)
- [SSH 키 관리 가이드](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
