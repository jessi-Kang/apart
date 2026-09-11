"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle, MiniGrid, VForm, VRow } from "@/components/VerdictForm";
import { LevelBar } from "@/components/LevelBar";
import { SheetFooter } from "@/components/SheetFooter";
import { comboState, currentStreak, endlessRecord, loadResult, type ComboState } from "@/lib/local";
import { currentLevel, type LevelInfo } from "@/lib/level";

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
  daily: Rank | null;
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
  const [today, setToday] = useState<{ date: string; marks: boolean[] } | null>(null);
  const [ranks, setRanks] = useState<RanksResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const o = endlessRecord("ox");
    const a = endlessRecord("assemble");
    const c = comboState();
    const saved = loadResult(date);
    setLevel(currentLevel());
    setOx(o);
    setAsm(a);
    setCombo(c);
    setStreak(currentStreak(date));
    setToday(saved ? { date: saved.date, marks: saved.marks } : null);
    setLoaded(true);

    const q = new URLSearchParams({ ox: String(o.best), assemble: String(a.best), findreal: String(c.best) });
    if (saved) q.set("score", String(saved.marks.filter(Boolean).length));
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

  const score = today ? today.marks.filter(Boolean).length : 0;

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          지금까지의
          <br />
          감별 <em>기록</em>입니다
        </h2>
        <p className="note">
          순위는 최근 7일 익명 집계와 비교한 값입니다.
          <br />
          기록은 이 기기에 저장되고, 로그인하면 계정으로 따라옵니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>기록 열람실</small>
          </Link>
          <Link className="close-x" href="/" aria-label="창구로 돌아가기">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </header>

        <section className="screen result">
          <DocTitle eyebrow="감별사기록부" title={`Lv.${level?.level ?? 1} ${level?.title ?? "견습 감별사"}`} />
          <p className="stamp-sub">
            {loaded ? `누적 ${level?.xp ?? 0}점 · 연속 출전 ${Math.max(streak.count, 0)}일` : "기록을 불러오는 중"}
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

          <VForm>
            <VRow label="오늘 공식전">
              {today ? (
                <MiniGrid marks={today.marks} label={`${today.marks.length}문제 중 ${score}문제 적중`} />
              ) : (
                <>
                  미출전 <small>창구에서 신청할 수 있습니다</small>
                </>
              )}
            </VRow>
            {today && (
              <VRow label="전국 순위">
                {ranks?.daily?.top != null ? (
                  <>
                    상위 <span className="accent">{ranks.daily.top}%</span> <small>{ranks.daily.sample}명</small>
                  </>
                ) : (
                  <>
                    집계 중 <small>표본 100명부터 공개</small>
                  </>
                )}
              </VRow>
            )}
            <VRow label="직급">
              <LevelBar />
            </VRow>
            {me?.configured && (
              <VRow label="계정">
                <span className="acct-line">
                  {me.user ? (
                    <>
                      {me.user.name}
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                          location.reload();
                        }}
                      >
                        로그아웃
                      </button>
                    </>
                  ) : (
                    <>
                      이 기기에만 저장 중
                      <a href="/api/auth/login">Google로 보관</a>
                    </>
                  )}
                </span>
              </VRow>
            )}
          </VForm>

          <div className="result-actions">
            <Link className="btn btn-next" href="/play">
              감별하러 가기
            </Link>
            <Link className="btn btn-ghost" href="/">
              창구로 돌아가기
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
