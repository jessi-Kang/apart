"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle, MiniGrid, VForm, VRow } from "@/components/VerdictForm";
import { LevelGauge } from "@/components/LevelBar";
import { GoogleMark } from "@/components/GoogleMark";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { coinedCount, comboState, currentStreak, endlessRecord, type ComboState } from "@/lib/local";
import { currentLevel, type LevelInfo } from "@/lib/level";
import { coinLevel, coinScore } from "@/lib/coinlevel";
import { episodeNumber, kstDateString } from "@/lib/episode";

interface Me {
  configured: boolean;
  user: { name: string } | null;
}
interface Rank {
  top: number | null;
  sample: number;
}
interface RanksResponse {
  endless: Record<string, Rank | null>;
  /** 창구별 공식전 순위 (ox / assemble / findreal) */
  daily: Record<string, Rank | null>;
}

/** 내가 지은 이름 한 줄과 그 성적 (작명소). 창구가 전개 전이면 응답이 404라 칸 자체가 없다 */
interface CoinedRow {
  name: string;
  area: string;
  approved: boolean;
  shown: number;
  fooled: number;
}
interface MyCoined {
  signedIn: boolean;
  accepted: number;
  fooled: number;
  shown: number;
  items: CoinedRow[];
}

/** 오늘 그 창구 공식전을 쳤다면 남는 것 */
interface DailyRun {
  marks: boolean[];
  area: string;
  topPct: number | null;
}

/**
 * 열람실에 펴는 이름 수.
 *
 * 여기는 요약하는 자리다. 이어 붙이는 "더 보기"를 달면 이름이 백 개인 사람의
 * 열람실이 백 줄짜리 목록이 된다 — 스크롤만 길어질 뿐 찾기는 더 어려워진다.
 * 잘 속인 셋만 자랑으로 걸고, 전체는 작명소의 접수 목록에서 쪽을 넘겨 본다.
 */
const COIN_TOP = 3;

const DAILY_KEYS = { ox: "aptgam:result", assemble: "aptgam:assemble", findreal: "aptgam:findreal" } as const;
const GAMES = [
  { mode: "ox", label: "감별 O/X", href: "/o" },
  { mode: "assemble", label: "이름 조립", href: "/a" },
  { mode: "findreal", label: "진짜 찾기", href: "/f" },
] as const;

/** 세 창구의 오늘 공식전 기록을 한 번에 읽는다 (창구마다 저장 키가 다르다) */
function readDaily(date: string): Record<string, DailyRun | null> {
  const out: Record<string, DailyRun | null> = {};
  for (const [mode, key] of Object.entries(DAILY_KEYS)) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null") as
        | { date?: string; marks?: boolean[]; area?: string; topPct?: number | null }
        | null;
      out[mode] =
        raw && raw.date === date && Array.isArray(raw.marks)
          ? { marks: raw.marks, area: raw.area ?? "", topPct: raw.topPct ?? null }
          : null;
    } catch {
      out[mode] = null;
    }
  }
  return out;
}

const fmtSec = (ms: number | null | undefined) =>
  ms == null ? null : `${(ms / 1000).toFixed(1)}초`;

/** 기록 열람실 — 내 기록과 남들 사이에서의 위치를 한 장에 모은다 */
export default function RecordPage() {
  const [level, setLevel] = useState<LevelInfo | null>(null);
  const [ox, setOx] = useState({ best: 0, avgMs: null as number | null });
  const [asm, setAsm] = useState({ best: 0, avgMs: null as number | null });
  const [combo, setCombo] = useState<ComboState>({ current: 0, best: 0 });
  const [streak, setStreak] = useState({ count: 0, playedToday: false });
  const [daily, setDaily] = useState<Record<string, DailyRun | null>>({});
  const [ranks, setRanks] = useState<RanksResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [coined, setCoined] = useState<MyCoined | null>(null);
  const [coinedHere, setCoinedHere] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const o = endlessRecord("ox");
    const a = endlessRecord("assemble");
    const c = comboState();
    const runs = readDaily(date);
    setDaily(runs);
    setLevel(currentLevel());
    setOx(o);
    setAsm(a);
    setCombo(c);
    setStreak(currentStreak(date));
    setLoaded(true);

    const q = new URLSearchParams({ ox: String(o.best), assemble: String(a.best), findreal: String(c.best) });
    // 공식전 순위는 창구마다 따로, 그때 고른 구역 안에서만 비교한다
    for (const [mode, run] of Object.entries(runs)) {
      if (!run) continue;
      q.set(`d_${mode}`, String(run.marks.filter(Boolean).length));
      if (run.area) q.set(`a_${mode}`, run.area);
    }
    fetch(`/api/records?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RanksResponse | null) => setRanks(d))
      .catch(() => undefined);

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: Me) => setMe(m))
      .catch(() => setMe({ configured: false, user: null }));

    // 작명소가 아직 전개 전이면 404다. 그때는 칸을 아예 그리지 않는다 —
    // 안 열린 창구의 기록 칸이 먼저 보이면 그 창구가 있다는 것을 알려 주는 셈이다
    setCoinedHere(coinedCount());
    fetch(`/api/coined/mine?limit=${COIN_TOP}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MyCoined | null) => setCoined(d))
      .catch(() => undefined);
  }, []);

  const rankCell = (r: Rank | null | undefined, mine: number) => {
    if (mine === 0) return <>기록 없음</>;
    if (!r || r.top === null) {
      return (
        <>
          집계 중 <small>표본 20판부터 공개</small>
        </>
      );
    }
    return (
      <>
        상위 <span className="accent">{r.top}%</span> <small>최근 7일 {r.sample}판</small>
      </>
    );
  };

  // 작명 호칭은 감별 직급과 갈라진 축이다 (lib/coinlevel.ts)
  const coinTitle = coinLevel(coinScore(coined?.accepted ?? 0, coined?.fooled ?? 0));

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          지금까지의
          <br />
          감별 <em>기록</em>입니다
        </h2>
        <p className="note">
          순위는 최근 7일 익명 집계와 비교한 값입니다. 기록은 이 기기에 남고,
          로그인하면 계정으로 따라옵니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>기록 열람실</small>
          </Link>
        </header>

        <section className="screen result">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>
          <DocTitle eyebrow="감별사기록부" title={`Lv.${level?.level ?? 1} ${level?.title ?? "견습 감별사"}`} />
          <p className="stamp-sub">
            {loaded ? `누적 ${level?.xp ?? 0}점 · 연속 출전 ${Math.max(streak.count, 0)}일` : "기록을 불러오는 중"}
          </p>
          {/* 직급 눈금은 제목 바로 아래다. 아래쪽 표에 따로 칸을 두면 같은
              "Lv.N 직급"이 한 화면에 두 번 나온다 */}
          {loaded && <LevelGauge />}

          {/* 위는 판을 거듭하며 쌓이는 것, 아래는 오늘 하루짜리다. 이름표가
              없으면 둘 다 그냥 "내 기록"으로 읽혀 오늘 성적이 누적으로 보인다 */}
          <p className="sec-cap">
            누적 기록<small>무한 · 계속 쌓입니다</small>
          </p>
          <VForm>
            <VRow label="감별 O/X">
              최고 연속 {ox.best}
              {fmtSec(ox.avgMs) && <small>평균 {fmtSec(ox.avgMs)}</small>}
              <span className="vr-rank">{rankCell(ranks?.endless.ox, ox.best)}</span>
            </VRow>
            <VRow label="이름 조립">
              최고 연속 {asm.best}
              {fmtSec(asm.avgMs) && <small>평균 {fmtSec(asm.avgMs)}</small>}
              <span className="vr-rank">{rankCell(ranks?.endless.assemble, asm.best)}</span>
            </VRow>
            <VRow label="진짜 찾기">
              최고 연속 {combo.best}
              {fmtSec(combo.bestAvgMs) && <small>평균 {fmtSec(combo.bestAvgMs)}</small>}
              <span className="vr-rank">{rankCell(ranks?.endless.findreal, combo.best)}</span>
            </VRow>
          </VForm>

          <div className="cut" />

          <p className="sec-cap">
            오늘의 공식전<small>제{episodeNumber(kstDateString())}호 · 자정에 새 판</small>
          </p>
          <VForm>
            {/* 공식전은 창구마다 문제도 순위도 따로다. 한 행에 뭉쳐 두면
                어느 게임 성적인지 알 수 없다 */}
            {GAMES.map((g) => {
              const run = daily[g.mode];
              const areaName = (run?.area ?? "").replace(/특별자치시$|특별시$|광역시$/, "");
              const rank = ranks?.daily?.[g.mode];
              return (
                <VRow key={g.mode} label={g.label}>
                  {run ? (
                    <>
                      <MiniGrid
                        marks={run.marks}
                        label={`${run.marks.length}문제 중 ${run.marks.filter(Boolean).length}문제 적중`}
                      />
                      <span className="vr-rank">
                        {rank?.top != null ? (
                          <>
                            {areaName || "전국"} 상위 <span className="accent">{rank.top}%</span>{" "}
                            <small>{rank.sample}명</small>
                          </>
                        ) : run.topPct != null ? (
                          <>
                            {areaName || "전국"} 상위 <span className="accent">{run.topPct}%</span>
                          </>
                        ) : (
                          <>
                            집계 중 <small>표본 100명부터 공개</small>
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <>미출전</>
                  )}
                </VRow>
              );
            })}
          </VForm>
          {/* 같은 안내를 행마다 되풀이하면 표가 안내문이 된다. 아직 안 친 창구가
              있을 때만, 표 아래에 한 번 */}
          {GAMES.some((g) => !daily[g.mode]) && (
            <p className="center-note">공식전 신청은 접수 대장의 현황 칸에서</p>
          )}

          {/* 작명소 칸. 창구가 전개 전이면 응답이 404라 coined가 null이고 칸이 통째로 없다.
              작명소 첫 화면이 "몇 명이 속았는지 세어 알려 드린다"고 약속하므로,
              그 약속을 지키는 자리가 여기다 */}
          {coined && (coined.items.length > 0 || coinedHere > 0) && (
            <>
              <div className="cut" />
              <p className="sec-cap">
                내가 지은 이름<small>잘 속인 순 {COIN_TOP}개 · 속인 사람 수만큼 호칭이 오릅니다</small>
              </p>
              <VForm>
                <VRow label="작명 호칭">
                  {coined.signedIn ? (
                    <span>
                      <b>{coinTitle.title}</b> <small className="mono">누적 {coinTitle.score}점</small>
                      <small>
                        접수 {coined.accepted}개 · 속인 사람 {coined.fooled}명
                        {coinTitle.next && ` · ${coinTitle.next.left}점 더 쌓으면 ${coinTitle.next.title}`}
                      </small>
                    </span>
                  ) : (
                    <span>
                      이 기기에서 {coinedHere}개 접수
                      {/* 서버는 비회원이 지은 이름을 누구 것인지 모른다. 되찾아 줄 수
                          없다는 사실을 숨기지 않는다 */}
                      <small>로그인하면 이름마다 몇 명이 속았는지 이어서 보여 드립니다</small>
                    </span>
                  )}
                </VRow>
                {/* 이름은 값 칸에 둔다. 이름표 칸은 폭이 고정이라 긴 단지명을 넣으면
                    옆 칸 글자 위로 넘어간다(실제로 겹쳤다). 대장처럼 순번을 이름표로 쓴다 */}
                {coined.items.map((it, i) => (
                  <VRow key={it.name} label={`${i + 1}`}>
                    <span>
                      <b>{it.name}</b>
                      {it.shown > 0 ? (
                        <small>
                          {it.shown}번 중 <span className="accent">{it.fooled}명</span> 속음 · 속은 비율{" "}
                          {Math.round((it.fooled / it.shown) * 100)}%
                        </small>
                      ) : (
                        // 뒷말("감별 창구에 올라가면 그때부터 셉니다")은 줄마다 되풀이하지
                        // 않는다. 검토 중인 이름이 여럿이면 같은 문장이 그 수만큼 쌓인다
                        <small>{it.approved ? "출제 대기" : "검토 중"}</small>
                      )}
                    </span>
                  </VRow>
                ))}
                {coined.signedIn && coined.items.length === 0 && (
                  <VRow label="접수한 이름">
                    <span>
                      아직 없습니다
                      <small>
                        <Link href="/n">작명소</Link>에서 지으면 여기 쌓입니다
                      </small>
                    </span>
                  </VRow>
                )}
              </VForm>
              {coined.accepted > coined.items.length && (
                <p className="center-note">
                  <Link href="/n?mine=1">접수한 이름 {coined.accepted}개 전부 보기</Link>
                </p>
              )}
            </>
          )}

          {/* 계정은 오늘 성적이 아니라 이 사람에 대한 것이라 제 칸을 갖는다.
              직급 칸은 없앴다 — 제목과 그 아래 눈금이 이미 같은 말을 한다 */}
          {me?.configured && (
            <>
              <p className="sec-cap">계정</p>
              <VForm>
                <VRow label="보관">
                  <span className="acct-line">
                  {me.user ? (
                    <>
                      <GoogleMark />
                      {me.user.name}
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                          // 로그아웃하면 접수 창구로 돌려보낸다. 제자리에서 새로고침하면
                          // 방금 나온 사람에게 열람실이 다시 뜬다.
                          // replace로 가야 뒤로 가기가 로그인 상태의 열람실을 되살리지 않는다.
                          location.replace("/");
                        }}
                      >
                        로그아웃
                      </button>
                    </>
                  ) : (
                    <>
                      이 기기에만 저장 중
                      <a href="/api/auth/login">
                        <GoogleMark />
                        Google로 보관
                      </a>
                      {/* 로그인하면 collectLocal()이 이 기기 기록을 함께 올리고
                          항목마다 큰 쪽으로 합쳐진다. 지워지지 않는다는 걸 말해 준다 */}
                      <small>지금까지 친 기록도 그대로 이어집니다</small>
                    </>
                  )}
                  </span>
                </VRow>
              </VForm>
            </>
          )}

          {/* 여기서 나가는 길은 접수 창구 하나다. 전에는 이 단추가 감별 O/X로
              바로 넘어갔는데, 열람실에서 나오는 사람이 무엇을 하고 싶은지는
              알 수 없다 — 셋 중 하나를 대신 골라 주는 셈이었다 */}
          <div className="result-actions">
            <Link className="btn btn-next full" href="/">
              창구로 돌아가기
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
