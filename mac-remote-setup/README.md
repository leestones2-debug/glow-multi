# Mac Studio ↔ 맥북 원격 연결 (2줄로 끝)

## ① Mac Studio (회사) — 터미널에 붙여넣기

```bash
curl -fsSL https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/install-mac-studio.sh | sudo bash
```

- 브라우저가 열리면 **Tailscale 로그인** (Google/Apple 등)
- 끝나면 화면에 **맥북용 명령**이 나옵니다

## ② 맥북 (집) — 터미널에 붙여넣기

```bash
curl -fsSL https://raw.githubusercontent.com/leestones2-debug/glow-multi/cursor/mac-studio-remote-setup-b168/mac-remote-setup/install-macbook.sh | bash
```

- Tailscale **같은 계정**으로 로그인
- Mac Studio **비밀번호 1번** 입력 (이후 자동)

## 접속

| 방법 | 명령 |
|------|------|
| 터미널 | `ssh work-mac` |
| 화면 공유 | Finder → 이동 → 서버에 연결 → `vnc://work-mac` |
| Cursor | `Cmd+Shift+P` → Remote-SSH → `work-mac` |

## 주의

- Mac Studio와 맥북 모두 **Tailscale 같은 계정**으로 로그인
- 회사 보안 정책상 Tailscale이 막히면 IT팀에 VPN 문의
