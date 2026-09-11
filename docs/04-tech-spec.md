# 04. 기술 사양

설계 목표: **런타임 AI 호출 0, 서버비 거의 0, 자정 트래픽 스파이크를 캐시로 흡수, 1인 개발로 M1 완성 가능한 규모.** 아래는 `web/`에 실제로 구현된 내용을 기준으로 하고, 아직 없는 것은 "미구현/계획"으로 표시한다.

## 1. 스택 (현재)

| 레이어 | 선택 | 메모 |
|---|---|---|
| 프론트/서버 | **Next.js 15 App Router + TypeScript, React 19** | 모바일 웹 우선, 네이티브 앱 없음. 링크 타고 바로 플레이 |
| 런타임 의존성 | **`@neondatabase/serverless` 하나뿐** | 나머지는 next/react/react-dom. UI·사운드·공유카드 전부 자체 구현 |
| 배포 | **Vercel 프로젝트 `apt-gam`** (Root Directory `web`) | 프로덕션 도메인 https://apt-game.app (`apt-gam.vercel.app`은 리디렉션) |
| DB | **Neon Postgres**(DB `aptgam`) | 집계·계정만. 출제 데이터는 DB에 없다 |
| 출제 데이터 | **정적 JSON 2개** (`web/data/*.json`) | 번들에 포함. 조회 지연·쿼리 비용 0 |
| OG 이미지 | **`next/og`의 `ImageResponse`** | `app/r/[slug]/opengraph-image.tsx` 1종 |
| 공유 이미지 | **Canvas 2D 직접 드로잉** (`lib/sharecard.ts`) | 1080×1350 접수증. 라이브러리 없음 |
| 배치(수집·검증) | Node 스크립트 (`web/scripts/*.mjs`) | 수동 실행. CI 배치는 미구현 |
| 관리 화면 | **미구현** | 검수 큐·편성 도구는 [03 문서](03-content-pipeline.md#4-검수-프로세스-사람) 참조 |

## 2. 데이터 모델

### 2-1. 출제 풀 (정적 파일, DB 아님)

```jsonc
// web/data/apartments.json — K-apt 실데이터 7,532건 (서울 전수 + 시도 14곳 표본)
{ "items": [{
  "id": "kA10021295",        // "k" + kaptCode
  "name": "경희궁의아침4단지",
  "sido": "서울특별시", "sigungu": "종로구", "dong": "내수동",
  "builtYear": 2004, "households": 120,
  "difficulty": "easy"       // easy | mid | hard (수집 시 규칙 라벨)
}] }

// web/data/fake_names.json — LLM 배치 생성 262건
{ "items": [{
  "id": "f01",
  "name": "e편한세상 더 프라임 노블",
  "hint": "실존 브랜드에 없는 조합을 붙였습니다",  // 정답 공개용 한 줄
  "difficulty": "easy"
}] }
```

- `apartments.collected.json`은 수집 직후 원본이며, 검토 후 `apartments.json`으로 승격한다.
- **`daily_quizzes` 테이블은 없다.** 일일 문제는 KST 날짜를 시드로 한 결정적 생성(§4)이라 저장할 것이 없다. `excluded`·`last_used_at` 같은 출제 이력 필드도 아직 없다(90일 재출제 금지 미구현).

### 2-2. Postgres (Neon, 집계·계정)

```sql
-- 공식전 문항별 익명 집계 (lib/stats.ts)
question_stats (date, no, answered, correct)        -- PK (date, no)

-- 공식전 점수 분포, 상위 % 산출용 (lib/stats.ts)
score_dist     (date, score, cnt)                   -- PK (date, score)

-- 무한 세션 판 기록 (lib/runstats.ts)
endless_runs   (mode, date, best, hits, cnt, avg_ms, created_at)
               -- mode: ox | assemble | findreal, 최근 7일 백분위 산출

-- 계정 (lib/userdb.ts)
app_user       (id, google_sub UNIQUE, email, name)
user_state     (user_id PK, state jsonb, updated_at)  -- lib/sync.ts의 SyncState
```

- 집계에 개인 식별자는 없다. `question_stats`·`score_dist`는 **공식전(데일리 O/X)만** 쌓는다. 조립·진짜 찾기의 공식전과 무한 모드는 전국 정답률 비교가 무의미하거나 문제가 제각각이라 문항 집계를 하지 않고, 무한 세션만 판 단위로 `endless_runs`에 들어간다.
- `DATABASE_URL`이 없으면 `lib/stats.ts`가 로컬 JSON 파일 스토어(`.data/stats.json`)로 자동 강등된다. 개발용이며 서버리스 다중 인스턴스에서는 쓰지 않는다.
- DB 오류는 전부 삼켜 "집계 중"(null)으로 강등한다. 집계 실패가 게임 진행이나 로그인을 막지 않는다.
- 2단계 작명소 모드용 `submissions`·`votes`는 계획 단계이며 아직 만들지 않았다.

## 3. API

전부 App Router 라우트 핸들러(`export const dynamic = "force-dynamic"`)다. 정답은 어떤 응답에도 미리 담기지 않는다.

| 엔드포인트 | 메서드 | 내용 |
|---|---|---|
| `/api/quiz/today` | GET | 공식전 10문제. `{no, name}`만 + `date`·`episode` |
| `/api/quiz/answer` | POST | `{date, no, choice, practice?}` → 정답 여부 + 실단지 메타/가짜 힌트 + 전국 정답률. `choice:"timeout"`은 무조건 오답, `practice:true`면 집계 제외 |
| `/api/quiz/finish` | POST | `{date, score}` → 점수 분포 +1, 상위 % 반환 |
| `/api/assemble/today` | GET | 조립 10문제. 조각·정답 길이·힌트(위치·연도·세대수) |
| `/api/assemble/check` | POST | `{date, no, guess[]}` → 정답 여부 + 정답·메타 공개 |
| `/api/assemble/hint` | GET | `?no&tier` → 초성 힌트 마스크 (최대 3글자까지만) |
| `/api/findreal/today` | GET | 진짜 찾기 10라운드, 섞인 보기 4개 |
| `/api/findreal/check` | POST | `{date, no, pick \| timeout}` → 정답 여부 + 진짜·메타 공개 |
| `/api/endless/ox` | GET / POST | 랜덤 1문제 / `{name, choice}` 판정 |
| `/api/endless/find` | GET / POST | 랜덤 4지선다 / `{options, pick}` 판정 (조작된 보기는 거부) |
| `/api/endless/assemble` | GET / POST | 랜덤 퍼즐 / `{id, guess[]}` 판정 |
| `/api/endless/assemble/hint` | GET | `?id&tier` → 초성 힌트 마스크 |
| `/api/endless/finish` | POST | `{mode, best, hits, count, avgMs}` → 판 기록 저장 + 최근 7일 상위 % |
| `/api/auth/login` | GET | 구글 동의 화면으로 리디렉션 (state 쿠키 발급) |
| `/api/auth/callback` | GET | 코드 교환 → 사용자 upsert → 세션 쿠키 |
| `/api/auth/me` | GET | `{configured, user}` — 로그인 기능 on/off와 현재 세션 |
| `/api/auth/logout` | POST | 세션 쿠키 삭제 (CSRF 방지로 POST만) |
| `/api/state` | GET / PUT | 서버 보관 기록 조회 / 기기 기록 업로드 후 병합 (본문 8KB 제한) |

페이지 라우트: `/`(접수 대장 홈), `/play`(감별 O/X), `/assemble`(이름 조립), `/findreal`(진짜 찾기), `/r/{date}-{score}-{grid}`(공유 결과 + OG), `/manifest.webmanifest`.

- **정답을 클라이언트에 미리 내려주지 않는 이유**: 소스 보기로 만점 치팅 방지. 판정은 서버에서만. 자동화 치팅은 여전히 가능하지만 순위 경쟁이 없어 방어 비용을 더 들이지 않는다.
- 캐시: `today` 계열만 `max-age=60`, 나머지는 `no-store` 또는 기본값. 문제 자체가 시드 생성이라 CDN 장시간 캐시의 이득이 크지 않다.
- 구역 출제: `/api/endless/ox`와 `/api/endless/find`가 `?area=<자치구>`를 받는다. 알 수 없는 값은 무시하고 서울 전체로 낸다.
- 미구현: `/api/quiz/yesterday`(어제 문제 열람), `/admin/*`.

## 4. 출제 로직

- `lib/daily.ts`: KST 날짜 문자열(`YYYY-MM-DD`)을 숫자 시드로 바꿔 mulberry32 난수를 돌린다. 진짜:가짜 4:6~6:4, 난이도 커브 `easy, easy, mid×5, hard×3`. 회차 번호(`제N호`)는 기준일(2026-09-10 = 1호)로부터의 경과일.
- `lib/assemble.ts`·`lib/findreal.ts`: 같은 날짜 시드에 오프셋(777000000 / 555000000)을 더해 모드별로 문제가 겹치지 않게 한다.
- `lib/endless.ts`: 무한 모드는 시드 없이 매 요청 `Math.random()`으로 풀에서 뽑는다. 판정은 이름/단지 id를 되돌려 받아 서버 사전에서 조회하는 방식이라 클라이언트가 진짜/가짜를 유추할 값이 없다.
- 시간대: 모든 날짜 판정은 KST 고정(UTC + 9h 후 앞 10자리).

## 5. 계정·기록 동기화

- **구글 OAuth 코드 플로우를 직접 구현**한다(의존성 0). `lib/auth.ts`가 HMAC-SHA256 서명 세션 쿠키(`aptgam_session`, 180일)를 발급하고, 쿠키에는 `{uid, name, exp}`만 담는다(이메일 등 PII 미포함). `state` 쿠키로 CSRF를 막고, 세션 쿠키는 `httpOnly` + `SameSite=Lax`.
- 필요 env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`. **하나라도 없으면 로그인 UI가 자동으로 숨고 비회원 모드만 동작한다.**
- 기록은 기본이 localStorage다(`lib/local.ts`, `lib/level.ts`). 로그인 시에만 `lib/cloud.ts`가 진입 시 pull, 변경 시 디바운스 push를 한다.
- 병합 규약은 `lib/sync.ts`에 서버·클라 공용으로 두고 양쪽에서 같은 함수를 쓴다. 원칙은 "잃지 않는 쪽": XP·최고 기록은 큰 값, 날짜 기록은 최신 날짜. 서버도 저장 전에 같은 병합을 거쳐 늦게 도착한 기기 쓰기가 기록을 덮지 않게 한다. 업로드 본문은 `sanitizeState`로 전부 정규화한다.

## 6. 이미지 (OG·공유)

- **링크 미리보기**: `app/r/[slug]/opengraph-image.tsx`의 `ImageResponse` 1종, 1200×630. 슬러그 `{date}-{score}-{grid}`가 같으면 URL이 같아 CDN 캐시가 먹는다. 한글 폰트는 필요한 글자만 서브셋으로 받아온다.
- **공유 이미지 카드**: `lib/sharecard.ts`가 Canvas 2D로 그리는 1080×1350 "접수증". 절취선·괘선·등급 도장·바코드를 직접 그린다. 세로형 스토리 사이즈(1080×1920)와 시안 재작업은 보류 상태.
- 텍스트 공유(클립보드)는 이모지 그리드를 쓰지만, 화면·이미지 요소는 전부 SVG/캔버스로 그린다.

## 7. PWA (구현)

- 매니페스트 `app/manifest.ts`(standalone, 아이콘 192/512/maskable), 서비스워커 `public/sw.js`, 등록 컴포넌트 `components/PwaRegister.tsx`, 설치 안내 `components/InstallToast.tsx` + `lib/install.ts`.
- 서비스워커는 **일부러 캐시하지 않는다.** 요청을 그대로 통과시켜 설치 요건만 만족시킨다. 데일리 콘텐츠라 캐시 신선도가 오프라인 지원보다 중요하다.
- `beforeinstallprompt`는 번들 로드 전에 발사될 수 있어 `layout.tsx` head의 선점 스크립트로 잡아 두고, 설치 토스트가 회수해 쓴다. 매니페스트 `<link>`도 head에 직접 둔다(force-dynamic 페이지에서 Next가 메타데이터를 body로 스트리밍하면 크롬이 설치를 막았던 이력).

## 8. 배포

- **경로는 하나뿐이다**: 푸시 → GitHub Actions(`.github/workflows/vercel-deploy.yml`) → Vercel Deploy Hook(`VERCEL_DEPLOY_HOOK` 시크릿) → 배포. 깃 웹훅 경로는 `web/vercel.json`의 `{"git":{"deploymentEnabled":false}}`로 꺼져 있다(이중 배포 방지).
- 워크플로에 `concurrency`를 걸어 연달아 푸시하면 마지막 것만 훅을 쏜다. Actions 탭의 수동 실행(`workflow_dispatch`) 버튼으로 빈 커밋 없이 재배포할 수 있다.
- **주의 이력**: 배포가 조용히 멈춘 적이 있는데 원인은 웹훅 유실이 아니라 **계정 단위 일일 배포 한도**였다. 프로젝트별이 아니라 계정 전체 합산이며, 한도를 넘으면 훅이 201을 돌려주고 빌드만 생기지 않아 유실처럼 보인다. 현재는 Pro 플랜.
- 비밀 값은 전부 `web/.env.local`(로컬)과 Vercel 환경변수로만 주입한다. 커밋 금지 대상: `DATABASE_URL`, `KAPT_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`.
- 명령: `npm run dev` / `npm run build && npm start` / `npm run typecheck` / `npm run validate-pool` / `npm run collect-kapt`.

## 9. 비용 구조

| 항목 | 비용 |
|---|---|
| 호스팅/DB/OG | Vercel + Neon 무료~Pro 티어. 쓰기는 카운터 증가뿐이라 캐시 중심 구조로 버팀 |
| LLM 생성 | 배치 생성만, 런타임 호출 0 |
| K-apt API | 공공데이터 무료 (기본정보 일일 5,000건 쿼터) |
| 도메인 | 연 1~2만 원 |

고정비가 사실상 도메인뿐이라 실패해도 매몰비용이 없고, 성공하면 트래픽 수익화를 붙일 여유가 있다.

## 10. 비기능 요구사항

- **자정 스파이크**: 출제가 시드 생성이라 DB 조회가 없다. 쓰기(`answer`/`finish`/`endless/finish`)는 upsert 카운터뿐이며, 부하 시 큐잉·배치 플러시로 바꿀 수 있게 집계를 `lib/stats.ts`·`lib/runstats.ts` 모듈로 분리해 뒀다. 트래픽이 붙으면 이 모듈만 교체한다.
- **표본 보호**: 정답률·상위 %는 표본 100건 미만(무한 판 기록은 20건 미만)이면 `null`로 내려 "집계 중"으로 표시한다.
- **접근성/성능**: 텍스트 중심이라 경량. 데이터 JSON이 번들에 들어가므로 서버 컴포넌트 경계를 지켜 클라이언트 번들로 새지 않게 한다.
- **분석**: 경량 이벤트 로깅(시작·문항별 응답·완주·공유 클릭·UTM)은 **미구현**. KPI 정의는 [05 문서](05-growth-and-ops.md#2-kpi) 참조.
