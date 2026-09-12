"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle } from "@/components/VerdictForm";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";

interface NameRow {
  name: string;
  shown: number;
  fooled: number;
  rate: number;
}
interface Report {
  real: NameRow[];
  fake: NameRow[];
  ready: { real: number; fake: number };
  minShown: number;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/**
 * 감별 리포트: 사람들이 가장 잘 속은 이름.
 *
 * 두 줄기를 나란히 놓는다.
 *   진짜인데 AI라고 속은 이름 — 사람이 지었는데 AI처럼 보이는 이름
 *   AI인데 진짜라고 속은 이름 — AI가 지었는데 진짜처럼 보이는 이름
 * 둘을 같이 봐야 "요즘 아파트 이름이 어떻게 생겼나"라는 이야기가 나온다.
 *
 * 아직 전개 전이라 운영자에게만 열린다(app/report/layout.tsx).
 */
export default function ReportPage() {
  const [data, setData] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/report")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: Report) => setData(d))
      .catch(() => setFailed(true));
  }, []);

  const table = (title: string, note: string, rows: NameRow[]) => (
    <>
      <div className="rep-head">
        <b>{title}</b>
        <small>{note}</small>
      </div>
      {rows.length === 0 ? (
        <p className="center-note">
          표본이 {data?.minShown ?? 30}번을 넘은 이름이 아직 없습니다
        </p>
      ) : (
        <ol className="roster">
          {rows.map((r, i) => (
            <li key={r.name}>
              <span className="rk mono">{i + 1}</span>
              <span className="who">{r.name}</span>
              <span className="lv mono">
                {pct(r.rate)}
                <small>
                  {r.shown}번 중 {r.fooled}번
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          사람들이 가장
          <br />
          많이 <em>속은</em> 이름
        </h2>
        <p className="note">
          감별 O/X에서 쌓인 이름별 집계입니다. 표본이 {data?.minShown ?? 30}번을 넘은 이름만
          싣습니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>감별 리포트</small>
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
          <DocTitle eyebrow="감별통계" title="가장 많이 속은 이름" />

          {failed && <p className="center-note">리포트를 불러오지 못했습니다</p>}
          {!failed && !data && <p className="center-note">집계를 펼치는 중입니다</p>}

          {data && (
            <>
              <p className="rep-intro">
                표본이 {data.minShown}번을 넘은 이름만 싣습니다. 지금 진짜 {data.ready.real}개 ·
                지어낸 이름 {data.ready.fake}개가 문턱을 넘었습니다.
              </p>
              {table("진짜인데 AI라고 속은 이름", "사람이 지었는데 AI처럼 보인 쪽", data.real)}
              {table("AI인데 진짜라고 속은 이름", "AI가 지었는데 진짜처럼 보인 쪽", data.fake)}
            </>
          )}

          <div className="result-actions">
            <Link className="btn btn-ghost" href="/record">
              기록 열람실
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
