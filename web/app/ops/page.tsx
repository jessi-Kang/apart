"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle, VForm, VRow } from "@/components/VerdictForm";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { PERIODS, PERIOD_LABEL, type OpsStats, type Period } from "@/lib/opsperiod";

/** 홈 접수 대장과 같은 순서로 세운다. 같은 셋을 화면마다 다른 순서로
    보여주면 어느 줄이 어느 창구인지 매번 다시 읽게 된다 */
const GAMES = [
  { mode: "ox", label: "감별 O/X" },
  { mode: "assemble", label: "이름 조립" },
  { mode: "findreal", label: "진짜 찾기" },
];
const label = (mode: string) => GAMES.find((g) => g.mode === mode)?.label ?? mode;
const inLedgerOrder = <T extends { mode: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const i = GAMES.findIndex((g) => g.mode === a.mode);
    const j = GAMES.findIndex((g) => g.mode === b.mode);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });
const areaLabel = (a: string) => (a ? a.replace(/특별자치시$|특별자치도$|특별시$|광역시$/, "") : "전국");

/**
 * 운영 현황 — 서비스가 돌고 있나.
 *
 * 리포트(`/report`)와 나눠 둔다. 거기는 "어떤 이름에 속았나"라는 콘텐츠
 * 이야기이고 여기는 "얼마나 치고 있나"라는 운영 이야기다. 한 화면에 쌓으면
 * 무엇을 보러 온 화면인지 흐려진다.
 *
 * 기간은 게임과 같은 KST 날짜로 자른다.
 */
export default function OpsPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<OpsStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setData(null);
    setFailed(false);
    fetch(`/api/ops?p=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: OpsStats) => setData(d))
      .catch(() => setFailed(true));
  }, [period]);

  const endlessTotal = data?.endless.reduce((s, r) => s + r.runs, 0) ?? 0;
  const officialTotal = data?.official.reduce((s, r) => s + r.entries, 0) ?? 0;

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          오늘 창구가
          <br />
          얼마나 <em>돌았나</em>
        </h2>
        <p className="note">무한 판과 공식전 출전, 계정과 제보를 기간별로 봅니다.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>운영 현황</small>
          </Link>
          <Link className="close-x" href="/" aria-label="창구로 돌아가기">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </header>

        <section className="screen result">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>
          <DocTitle eyebrow="운영현황" title={PERIOD_LABEL[period]} />

          {/* 기간은 네 갈래뿐이라 한 줄에 다 놓는다. 고르는 순간 다시 불러온다 */}
          <div className="area-tabs" role="tablist" aria-label="기간">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={p === period}
                className={`area-tab ${p === period ? "on" : ""}`}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>

          {failed && <p className="center-note">현황을 불러오지 못했습니다</p>}
          {!failed && !data && <p className="center-note">집계를 펼치는 중입니다</p>}

          {data && (
            <>
              <p className="sec-cap">
                무한<small>본편 · 판 {endlessTotal}</small>
              </p>
              <VForm>
                {data.endless.length === 0 ? (
                  <VRow label="기록">아직 없음</VRow>
                ) : (
                  inLedgerOrder(data.endless).map((r) => (
                    <VRow key={r.mode} label={label(r.mode)}>
                      {r.runs}판<small>{r.questions}문제 · 평균 최고 연속 {r.avgBest}</small>
                    </VRow>
                  ))
                )}
              </VForm>

              <p className="sec-cap">
                공식전<small>출전 {officialTotal}</small>
              </p>
              <VForm>
                {data.official.length === 0 ? (
                  <VRow label="출전">아직 없음</VRow>
                ) : (
                  inLedgerOrder(data.official).map((r) => (
                    <VRow key={r.mode} label={label(r.mode)}>
                      {r.entries}회<small>평균 {r.avgScore}점</small>
                    </VRow>
                  ))
                )}
              </VForm>

              <p className="sec-cap">
                구역<small>공식전 출전이 있는 곳</small>
              </p>
              <VForm>
                {data.areas.length === 0 ? (
                  <VRow label="구역">아직 없음</VRow>
                ) : (
                  data.areas.map((a) => (
                    <VRow key={a.area || "전국"} label={areaLabel(a.area)}>
                      {a.entries}회
                    </VRow>
                  ))
                )}
              </VForm>

              <p className="sec-cap">
                사람과 제보<small>계정은 누적, 제보는 이 기간</small>
              </p>
              <VForm>
                <VRow label="새 계정">
                  {data.users.joined}명<small>누적 {data.users.total}명</small>
                </VRow>
                <VRow label="기록 보관">
                  {data.users.withRecord}명
                </VRow>
                <VRow label="버그 제보">
                  {data.bugs.total}건<small>사례 나간 것 {data.bugs.awarded}건</small>
                </VRow>
              </VForm>

              <p className="rep-intro">
                {data.from ? `${data.from}부터 ${data.today}까지` : `처음부터 ${data.today}까지`} 집계했습니다.
              </p>
            </>
          )}

          {/* 내부 화면끼리는 서로 건너갈 수 있어야 한다. 홈까지 갔다 오면 두 번 걸린다 */}
          <div className="result-actions">
            <Link className="btn btn-ghost" href="/report">
              감별 리포트
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
