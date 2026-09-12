"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle, MiniGrid, VForm, VRow } from "@/components/VerdictForm";
import { LevelBar } from "@/components/LevelBar";
import { GoogleMark } from "@/components/GoogleMark";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { comboState, currentStreak, endlessRecord, type ComboState } from "@/lib/local";
import { currentLevel, type LevelInfo } from "@/lib/level";
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

/** 오늘 그 창구 공식전을 쳤다면 남는 것 */
interface DailyRun {
  marks: boolean[];
  area: string;
  topPct: number | null;
}

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
                <VRow key={g.mode} label={`${g.label} 공식전`}>
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
                    <>
                      미출전 <small>창구의 출전 도장을 누르면 신청됩니다</small>
                    </>
                  )}
                </VRow>
              );
            })}
          </VForm>

          {/* 직급과 계정은 오늘 성적이 아니라 이 사람에 대한 것이다. 공식전 표
              안에 같이 두면 "오늘의 공식전" 이름표가 셋을 다 덮어 버린다 */}
          <p className="sec-cap">
            감별사 정보<small>직급 · 계정</small>
          </p>
          <VForm>
            <VRow label="직급">
              <LevelBar />
            </VRow>
            {me?.configured && (
              <VRow label="계정">
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
            )}
          </VForm>

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
