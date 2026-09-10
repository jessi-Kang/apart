# 04. 기술 사양

설계 목표: **런타임 AI 호출 0, 서버비 거의 0, 자정 트래픽 스파이크를 캐시로 흡수, 1인 개발로 M1 완성 가능한 규모.**

## 1. 스택 제안

| 레이어 | 선택 | 이유 |
|---|---|---|
| 프론트/서버 | **Next.js (App Router)** — 모바일 웹 우선, 네이티브 앱 없음 | 링크 타고 바로 플레이가 확산의 전제. 설치 장벽 0 |
| 배포 | Vercel류 엣지 배포 (무료 티어 시작) | 오늘의 퀴즈는 정적 캐시 가능 → 스파이크에 강함 |
| DB | 시작: SQLite(Turso/litefs류) 또는 무료 티어 Postgres(Neon류) | 쓰기는 결과 집계뿐이라 경량으로 충분. 규모 커지면 Postgres 승격 |
| OG 이미지 | @vercel/og (엣지에서 동적 생성 + CDN 캐시) | 결과 조합 수가 유한해 캐시 적중률 높음 |
| 배치(수집·생성) | 로컬/CI 스크립트 (Node 또는 Python) | K-apt 수집·LLM 생성·필터는 전부 오프라인 배치 |
| 관리 화면 | 같은 Next.js 앱의 `/admin` (Basic Auth) | 검수 큐·편성 도구. 별도 인프라 불필요 |

## 2. 데이터 모델

```sql
-- 실제 단지 (K-apt 수집)
apartments (
  id            PK,
  name          TEXT,      -- 정규화된 단지명
  name_raw      TEXT,      -- 원본 표기
  sido, sigungu, dong TEXT,
  built_year    INT,
  households    INT,
  difficulty    TEXT,      -- easy | mid | hard (규칙 초기값, 실측으로 갱신)
  excluded      BOOL,      -- 출제 제외 태그(민감 단지 등)
  last_used_at  DATE       -- 재출제 금지(90일) 판정용
)

-- 가짜 이름 (LLM 배치 생성)
fake_names (
  id            PK,
  name          TEXT,
  hint          TEXT,      -- 정답 공개용 생성 힌트 한 줄
  difficulty    TEXT,
  prompt_ver    TEXT,      -- 프롬프트 버전 (역측정용)
  profile       TEXT,      -- 생성 프로파일 (웃김형/한끗형 등)
  region_sigungu TEXT NULL, -- 우리 동네 모드용 지역 특화 가짜
  status        TEXT,      -- generated | auto_passed | approved | rejected
  reject_reason TEXT NULL,
  last_used_at  DATE
)

-- 일일 편성
daily_quizzes (
  date          DATE PK,   -- KST 기준
  items         JSON       -- [{no:1, kind:'real'|'fake', ref_id, difficulty}, ×10]
)

-- 문제별 익명 집계 (개인 식별 없음)
question_stats (
  date, no      PK,
  answered      INT,
  correct       INT
)

-- 일별 점수 분포 (상위 % 표시용)
daily_score_dist (
  date, score   PK,        -- score 0~10
  count         INT
)

-- 2단계: 작명소 모드
submissions ( id PK, date, name, pieces JSON, nickname, device_hash )
votes       ( id PK, date, winner_id, loser_id, device_hash )
```

- **유저 테이블 없음**: 로그인 없음. 스트릭·완료 여부·오답 기록은 전부 localStorage. 서버는 익명 집계만 저장 → 개인정보 이슈 원천 제거.
- localStorage 초기화 시 스트릭이 날아가는 것은 MVP에서 수용 (계정 연동은 리텐션이 검증된 뒤 검토).

## 3. API 설계

| 엔드포인트 | 메서드 | 내용 |
|---|---|---|
| `/api/quiz/today` | GET | 오늘의 10문제. **정답 미포함** — `{no, name}`만. CDN 캐시 (자정 무효화) |
| `/api/quiz/answer` | POST | `{date, no, choice}` → 정답 여부 + 메타데이터(실단지: 위치·연도·세대수 / 가짜: 힌트) + 현재 정답률 반환. 집계 +1 |
| `/api/quiz/finish` | POST | `{date, score}` → 점수 분포 집계 +1, 상위 % 반환 |
| `/api/quiz/yesterday` | GET | 어제 문제+정답 열람용 (플레이 불가) |
| `/r/{date}-{score}-{grid}` | GET | 공유 결과 페이지 (OG 메타 포함) |
| `/api/og/{date}-{score}-{grid}` | GET | OG 이미지 동적 생성 (엣지, CDN 캐시) |
| `/admin/*` | — | 검수 큐, 주간 편성 도구, 오류 제보 처리 (Basic Auth) |

- **정답을 클라이언트에 미리 내려주지 않는 이유**: 소스 보기로 만점 치팅 방지. 문제당 answer 호출로 판정. 그래도 자동화 치팅은 가능하지만, 순위 경쟁이 없는 게임이라 방어 비용을 더 들이지 않는다.
- 우리 동네 모드(2단계): `/api/local/{sigungu}/quiz` — 지역 풀에서 랜덤 10개, 캐시 불가하므로 경량 쿼리로 설계.

## 4. OG 이미지

- 입력: 날짜, 점수, 이모지 그리드, (파생) 등급명·색상 톤.
- 출력: 1200×630 (링크 미리보기 표준) + 1080×1920 세로형(스토리 저장용) 2종.
- 같은 날짜·점수·그리드 조합은 URL이 같으므로 CDN 캐시 적중 → 생성 비용 무시 가능.

## 5. 비용 구조

| 항목 | 비용 |
|---|---|
| 호스팅/DB/OG | 무료 티어로 시작. DAU 수만까지 캐시 중심 구조로 버팀 |
| LLM 생성 | 분기 1~2회 배치, 수천 건 = 수 달러 수준. **런타임 호출 0** |
| K-apt API | 공공데이터 무료 |
| 도메인 | 연 1~2만 원 |

고정비가 사실상 도메인뿐이므로, 실패해도 매몰비용이 없고 성공하면 트래픽 수익화(제휴·광고)를 붙일 여유가 있다.

## 6. 비기능 요구사항

- **자정 스파이크**: `quiz/today`는 정적 캐시라 무관. 쓰기(`answer`/`finish`)는 카운터 증가뿐 — DB 부하 시 큐잉/배치 플러시로 전환 가능하게 집계 로직을 모듈로 분리.
- **시간대**: 모든 날짜 판정은 KST 고정 (서버 UTC여도 KST로 변환).
- **접근성/성능**: 텍스트 중심이라 경량. 첫 로드 100KB 이하 목표, 오프라인 재방문 대비 기본 셸 캐싱(PWA는 MVP 이후).
- **분석**: 경량 이벤트 로깅 (시작, 문항별 응답·체류시간, 완주, 공유 클릭, 유입 채널 UTM). KPI 정의는 [05 문서](05-growth-and-ops.md#2-kpi) 참조.
