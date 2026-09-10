# 아파트 감별사 (apart)

"진짜 아파트냐, AI가 지은 이름이냐"를 맞히는 데일리 퀴즈 서비스. 기획 문서는 `docs/`, 디자인 시안은 `design/`에 있다.

## 디자인 규칙 (필수)

- **디자인 파일(`design/` 및 이후 UI 코드)을 만들거나 수정하면 반드시 impeccable로 검증한다.**
  - 검증 명령: `~/.claude/skills/impeccable/scripts/impeccable detect --json <파일들>`
  - 이 프로젝트에는 impeccable 디자인 훅이 켜져 있다(`.impeccable/config.json`). 훅이 동작하지 않는 세션에서는 위 명령을 수동 실행한다.
  - 디텍터 경고는 실제 배경/전경 페어를 코드에서 확인해 검증하고, 실제 이슈만 수정한다. 오탐이면 사유를 남긴다.
- 그리드·판정 등 시각 요소는 이모지가 아닌 그래픽(SVG/캔버스)으로 그린다. 이모지는 클립보드 공유 텍스트에만.
- 새 UI를 만들 때는 taste-skill(`~/.claude/skills/taste-skill`)의 안티-슬롭 원칙을 따른다: em-dash 금지, eyebrow 남용 금지, 단일 액센트, 모바일 퍼스트(`min-height:100dvh`, 768/1024 브레이크포인트), `prefers-reduced-motion` 대응.

## 시안 구성

| 파일 | 방향 |
|---|---|
| `design/sian-a-document.html` | **확정 방향.** 접수 서류 콘셉트: 접수 창구 홈 + 본편 O/X + 이름 조립 + 진짜 찾기 + db 접수 대장 |
| `design/sian-b-nightboard.html` | 야간 전광판 콘셉트. **디벨롭 중단** (확정 방향 아님, 수정 금지) |
| `design/sian-c-gameshow.html` | 대안 보관 (구 확정안, 게임쇼 팝). 디벨롭은 A 기준으로 진행 |
| `design/submodes-a.html` / `design/submodes-c.html` | 서브 모드(작명소·우리 동네) 시안. A 스타일이 기준, C는 보관 |
| `design/sharecard-a.html` / `design/sharecard-c.html` | 이미지 공유 카드 시안. **보류** (품질 미달 판정, 재작업 전까지 디벨롭 금지) |

시안 A~C는 동일한 코어 루프(인트로 → 10문제 → 정답 공개 → 등급/공유)를 담은 인터랙티브 목업이며, 모바일 퍼스트 반응형(모바일/타블렛 768px/데스크탑 1024px)이다.
