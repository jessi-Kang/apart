# 아파트 감별사 (apart)

"진짜 아파트냐, AI가 지은 이름이냐"를 맞히는 데일리 퀴즈 서비스. 기획 문서는 `docs/`, 디자인 시안은 `design/`에 있다.

## 디자인 규칙 (필수)

- **디자인 파일(`design/` 및 이후 UI 코드)을 만들거나 수정하면 반드시 impeccable로 검증한다.**
  - 검증 명령: `~/.claude/skills/impeccable/scripts/impeccable detect --json <파일들>`
  - 이 프로젝트에는 impeccable 디자인 훅이 켜져 있다(`.impeccable/config.json`). 훅이 동작하지 않는 세션에서는 위 명령을 수동 실행한다.
  - 디텍터 경고는 실제 배경/전경 페어를 코드에서 확인해 검증하고, 실제 이슈만 수정한다. 오탐이면 사유를 남긴다.
- 새 UI를 만들 때는 taste-skill(`~/.claude/skills/taste-skill`)의 안티-슬롭 원칙을 따른다: em-dash 금지, eyebrow 남용 금지, 단일 액센트, 모바일 퍼스트(`min-height:100dvh`, 768/1024 브레이크포인트), `prefers-reduced-motion` 대응.

## 시안 구성

| 파일 | 방향 |
|---|---|
| `design/sian-a-document.html` | 접수 서류 콘셉트. 라이트, 잉크 블랙 + 도장 레드, sharp radius |
| `design/sian-b-nightboard.html` | 야간 전광판 콘셉트. 다크, 일렉트릭 그린, soft radius |
| `design/sian-c-gameshow.html` | O/X 게임쇼 콘셉트. 코발트 + 크림, pill 버튼 |

세 시안 모두 동일한 코어 루프(인트로 → 10문제 → 정답 공개 → 등급/공유)를 담은 인터랙티브 목업이며, 모바일 퍼스트 반응형(모바일/타블렛 768px/데스크탑 1024px)이다.
