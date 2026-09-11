# 아파트 감별사 (apart)

"진짜 아파트냐, AI가 지은 이름이냐"를 맞히는 데일리 퀴즈 서비스. 기획 문서는 `docs/`, 디자인 시안은 `design/`에 있다.

## 디자인 규칙 (필수)

- **디자인 파일(`design/` 및 이후 UI 코드)을 만들거나 수정하면 반드시 impeccable로 검증한다.**
  - 검증 명령: `~/.claude/skills/impeccable/scripts/impeccable detect --json <파일들>`
  - 이 프로젝트에는 impeccable 디자인 훅이 켜져 있다(`.impeccable/config.json`). 훅이 동작하지 않는 세션에서는 위 명령을 수동 실행한다.
  - 디텍터 경고는 실제 배경/전경 페어를 코드에서 확인해 검증하고, 실제 이슈만 수정한다. 오탐이면 사유를 남긴다.
- 그리드·판정 등 시각 요소는 이모지가 아닌 그래픽(SVG/캔버스)으로 그린다. 이모지는 클립보드 공유 텍스트에만.
- 도장·뱃지·마스코트 등 벡터 에셋이 필요하면 `svg-creator` 스킬(`~/.claude/skills/svg-creator`)로 제작한다. 브랜드 보드·무드 이미지는 `brandkit` 스킬.
- 새 UI를 만들 때는 taste-skill(`~/.claude/skills/taste-skill`)의 안티-슬롭 원칙을 따른다: em-dash 금지, eyebrow 남용 금지, 단일 액센트, 모바일 퍼스트(`min-height:100dvh`, 768/1024 브레이크포인트), `prefers-reduced-motion` 대응.

## 시안 구성

| 파일 | 방향 |
|---|---|
| `design/sian-a-document.html` | **확정 방향.** 접수 서류 콘셉트: 접수 창구 홈 + 본편 O/X + 이름 조립 + 진짜 찾기 + db 접수 대장 |
| `design/sian-b-nightboard.html` | 야간 전광판 콘셉트. **디벨롭 중단** (확정 방향 아님, 수정 금지) |
| `design/sian-c-gameshow.html` | 대안 보관 (구 확정안, 게임쇼 팝). 디벨롭은 A 기준으로 진행 |
| `design/home2-a-ledger.html` | **홈 확정 방향.** 접수 대장: 순번·창구·현황 3열 서식 + 현황 도장 (web/ 홈에 적용됨) |
| `design/home2-b-tiles.html` / `design/home2-c-poster.html` | 홈 대안 보관 (창구 타일 벤토 / 공고 포스터) |
| `design/submodes-a.html` / `design/submodes-c.html` | 서브 모드(작명소·우리 동네) 시안. A 스타일이 기준, C는 보관 |
| `design/sharecard-a.html` / `design/sharecard-c.html` | 이미지 공유 카드 시안. **보류** (품질 미달 판정, 재작업 전까지 디벨롭 금지) |

시안 A~C는 동일한 코어 루프(인트로 → 10문제 → 정답 공개 → 등급/공유)를 담은 인터랙티브 목업이며, 모바일 퍼스트 반응형(모바일/타블렛 768px/데스크탑 1024px)이다.

## 개발 (`web/`)

- 스택: Next.js 15 (App Router) + TypeScript, 런타임 추가 의존성 0. 집계는 `web/lib/stats.ts`의 JSON 파일 스토어(단일 인스턴스 전제) — 트래픽이 붙으면 이 모듈만 Postgres/Turso 구현으로 교체한다.
- 정답은 클라이언트에 절대 내려주지 않는다. 판정은 `/api/quiz/answer`에서만.
- `web/data/apartments.json`은 K-apt 실데이터(서울 전역, 목록 V4 + 기본정보 V5로 수집·정제). 갱신은 `npm run collect-kapt`(인증키는 `web/.env.local`의 `KAPT_API_KEY`, 절대 커밋 금지) → `npm run validate-pool` → `apartments.collected.json` 검토 후 승격. `fake_names.json`은 LLM 배치 생성 + validate-pool 대조를 거친 120건 — 추가 생성 시에도 같은 절차(생성 → validate-pool → 통과분만 등록)를 지킨다.
- 명령: `cd web && npm run dev` (개발), `npm run build && npm start` (프로드 확인), `npm run typecheck`, `npm run validate-pool` (출제 풀 검증).
- 게임 구조: **무한 모드가 본편** — 창구 진입 즉시 무한 세션 시작, 경쟁은 누적 기록(레벨·최고 연속·콤보)과 판 단위(세션 종료 시 최근 7일 익명 백분위, `endless_runs`). 데일리 10문제는 "제N호 공식전"으로 강등 — 게임 안 칩으로 선택 참가하는 랭킹전(question_stats·score_dist 집계는 공식전만).
- 집계 DB: Neon Postgres (프로젝트 frosty-term-36707081, DB `aptgam`, 테이블 question_stats·score_dist·endless_runs·app_user·user_state). 연결 문자열은 `web/.env.local`(로컬)과 Vercel 배포의 env로만 주입하고 절대 커밋하지 않는다.
- 계정: 구글 OAuth 코드 플로우 직접 구현(의존성 0, `lib/auth.ts` HMAC 세션 쿠키). 필요 env: `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`AUTH_SECRET`(모두 `web/.env.local` + Vercel, 절대 커밋 금지) — 하나라도 없으면 로그인 UI가 자동으로 숨고 비회원 모드만 동작한다. 기록 동기화 규약·병합은 `lib/sync.ts`(서버·클라 공용), 클라이언트 훅은 `lib/cloud.ts`(로그인 시에만 push/pull). 구글 콘솔 리디렉션 URI: `https://apt-gam.vercel.app/api/auth/callback`(+ 로컬 `http://localhost:3000/api/auth/callback`).
- 배포: Vercel 프로젝트 `apt-gam` → https://apt-gam-jessikang.vercel.app. **Git 자동 배포** — 이 리포가 연결되어 있고 Root Directory는 `web`, `DATABASE_URL`은 프로젝트 환경변수(Secret)로 등록됨. 기본 브랜치에 푸시하면 프로덕션 배포, 다른 브랜치는 프리뷰 배포. 수동 배포는 더 이상 하지 않는다. 푸시했는데 Vercel에 빌드가 안 생기면(웹훅 유실 — 두 번 겪음, 원인은 GitHub App 이벤트 유실이며 배포 횟수 제한 아님) 대시보드에서 Deployments→Create Deployment로 복구한다. **근본 대책**: `.github/workflows/vercel-deploy.yml`이 푸시마다 Vercel Deploy Hook을 호출한다 — Vercel Settings→Git→Deploy Hooks에서 훅을 만들어 리포 Actions 시크릿 `VERCEL_DEPLOY_HOOK`에 넣으면 활성화되고, 그 뒤 이중 배포를 막기 위해 `web/vercel.json`에 `{"git":{"deploymentEnabled":false}}`를 넣어 웹훅 경로를 끈다(시크릿 등록 전에는 절대 끄지 말 것).

## 커밋 규칙

이 레포의 커밋 메시지는 vibelog가 매일 밤 읽어 데브로그 글과 쇼츠 영상을
자동 생성하는 원료다. 커밋 메시지가 얇으면 글도 얇아진다.

- 한국어로 쓴다. 형식: `타입: 한 줄 요약` + 빈 줄 + 본문.
- 타입은 feat / fix / docs / chore / design / asset 중 하나. fix는 실제로
  깨졌던 것을 고쳤을 때만 쓴다 — 영상의 커밋 그래프가 타입별로 색을 입히고,
  fix 커밋은 글의 "삽질 포인트" 재료가 된다.
- 본문에 **"왜"**를 반드시 한 문장 이상 쓴다. 뭘 바꿨는지는 diff가 말해주니,
  왜 그렇게 했는지·뭘 시도하다 왜 버렸는지를 남긴다.
- 버그를 고친 커밋은 증상 → 원인 → 해결을 본문에 남긴다.
- 작업 단계가 끝날 때마다 커밋한다. 하루치를 한 커밋에 뭉치지 않는다.
- 커밋 메시지는 공개 블로그에 그대로 노출된다. 비밀 키·내부 URL·개인정보를
  쓰지 않는다.
