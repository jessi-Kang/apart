"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GridTile } from "@/components/GridTile";
import { Stamp } from "@/components/Stamp";
import { gradeFor } from "@/lib/grades";
import { bumpStreak, loadResult, saveResult, type ReviewItem, type SavedResult } from "@/lib/local";

interface TodayResponse {
  date: string;
  episode: number;
  items: { no: number; name: string }[];
}

interface AnswerResponse {
  correct: boolean;
  kind: "real" | "fake";
  meta?: { location: string; builtYear: number; households: number };
  hint?: string;
  rate: number | null;
  sample: number;
}

type Phase = "loading" | "question" | "reveal" | "result" | "error";

export default function PlayPage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [reveal, setReveal] = useState<AnswerResponse | null>(null);
  const [topPct, setTopPct] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/quiz/today")
      .then((r) => r.json())
      .then((data: TodayResponse) => {
        setQuiz(data);
        const saved = loadResult(data.date);
        if (saved) {
          restore(saved, data.date);
        } else {
          setPhase("question");
        }
      })
      .catch(() => setPhase("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restore(saved: SavedResult, date: string) {
    setMarks(saved.marks);
    setReview(saved.review);
    setStreak(bumpStreak(date));
    setPhase("result");
  }

  async function answer(choice: "real" | "fake") {
    if (!quiz || busy) return;
    setBusy(true);
    try {
      const item = quiz.items[idx];
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: quiz.date, no: item.no, choice }),
      });
      if (!res.ok) throw new Error("answer_failed");
      const data = (await res.json()) as AnswerResponse;
      setReveal(data);
      setMarks((m) => [...m, data.correct]);
      setReview((r) => [...r, { no: item.no, name: item.name, kind: data.kind, correct: data.correct }]);
      setPhase("reveal");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!quiz) return;
    if (idx + 1 < quiz.items.length) {
      setIdx(idx + 1);
      setReveal(null);
      setPhase("question");
      return;
    }
    // 완주 처리
    const score = marks.filter(Boolean).length;
    saveResult({ date: quiz.date, marks, review });
    setStreak(bumpStreak(quiz.date));
    setPhase("result");
    try {
      const res = await fetch("/api/quiz/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: quiz.date, score }),
      });
      if (res.ok) {
        const data = (await res.json()) as { top: number | null };
        setTopPct(data.top);
      }
    } catch {
      /* 집계 실패는 결과 표시에 영향 없음 */
    }
  }

  const score = marks.filter(Boolean).length;
  const grade = useMemo(() => gradeFor(score), [score]);

  function share() {
    if (!quiz) return;
    const grid = marks.map((m) => (m ? "🟩" : "⬛")).join("");
    const text = `아파트 감별사 #${quiz.episode} 🏢\n${grid} ${score}/10\n${grade.name}\napt-gam.kr`;
    navigator.clipboard?.writeText(text).then(() => setCopied(true));
  }

  const ep = quiz?.episode ?? "";
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          이름만 보고
          <br />
          판단하십시오. <em>검색은 반칙</em>
        </h2>
        {quiz && (
          <p className="date mono">
            제{ep}호 / {Number(mm)}월 {Number(dd)}일
          </p>
        )}
        <p className="note">
          정답마다 실제 위치와 준공년도가 공개됩니다.
          <br />
          10문제가 끝나면 감별 등급이 발급됩니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>진짜 단지명 판별 접수증</small>
          </Link>
          {quiz && (
            <div className="issue mono">
              #{ep}
              <br />
              {mm}.{dd}
            </div>
          )}
        </header>

        {phase === "loading" && (
          <section className="screen">
            <p className="center-note">오늘의 문제를 준비하고 있습니다</p>
          </section>
        )}

        {phase === "error" && (
          <section className="screen">
            <p className="center-note">
              문제를 불러오지 못했습니다.
              <br />
              네트워크 확인 후 새로고침해 주세요.
            </p>
            <div className="result-actions">
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        {(phase === "question" || phase === "reveal") && quiz && (
          <section className="screen">
            <div className="progress" aria-hidden="true">
              {quiz.items.map((_, k) => (
                <i key={k} className={k < idx ? "done" : k === idx ? "now" : ""} />
              ))}
            </div>
            <p className="qlabel mono">
              {String(idx + 1).padStart(2, "0")} / 10
            </p>
            <div className="qname-wrap">
              <h2 className="qname">{quiz.items[idx].name}</h2>
            </div>

            {phase === "reveal" && reveal && (
              <div className={`verdict ${reveal.correct ? "right" : "wrong"}`}>
                <span className="mark">{reveal.correct ? "정답" : "오답"}</span>
                <h3>{reveal.kind === "real" ? "진짜 있는 아파트입니다" : "AI가 지은 이름입니다"}</h3>
                <p className="meta">
                  {reveal.kind === "real" && reveal.meta ? (
                    <>
                      {reveal.meta.location}
                      <br />
                      {reveal.meta.builtYear}년 준공 · {reveal.meta.households.toLocaleString()}세대
                    </>
                  ) : (
                    reveal.hint
                  )}
                </p>
                <p className="rate">
                  {reveal.rate !== null
                    ? `이 문제, 지금까지 ${reveal.rate}%가 맞혔습니다`
                    : "전국 정답률 집계 중"}
                </p>
              </div>
            )}

            {phase === "question" ? (
              <div className="choices">
                <button className="btn btn-real" onClick={() => answer("real")} disabled={busy}>
                  진짜
                </button>
                <button className="btn btn-fake" onClick={() => answer("fake")} disabled={busy}>
                  가짜
                </button>
              </div>
            ) : (
              <div className="choices">
                <button className="btn btn-next full" onClick={next}>
                  {idx + 1 === quiz.items.length ? "감별 등급 확인" : "다음 문제"}
                </button>
              </div>
            )}
          </section>
        )}

        {phase === "result" && quiz && (
          <section className="screen result">
            <p className="score-label mono">감별 결과</p>
            <p className="big">{score} / 10</p>
            <Stamp>{grade.name}</Stamp>
            <p className="grade-desc">{grade.desc}</p>
            <div className="grid-line" role="img" aria-label={`10문제 중 ${score}문제 정답`}>
              {marks.map((m, k) => (
                <GridTile key={k} ok={m} />
              ))}
            </div>
            <p className="top-note">
              {topPct !== null && (
                <>
                  오늘 전국 상위 <b>{topPct}%</b> ·{" "}
                </>
              )}
              {streak > 0 && <>{streak}일 연속 감별 중</>}
            </p>
            <ul className="review">
              {review.map((r) => (
                <li key={r.no}>
                  <span className={`nm ${r.correct ? "" : "x"}`}>{r.name}</span>
                  <span className={`tag ${r.kind === "real" ? "" : "f"}`}>{r.kind === "real" ? "진짜" : "가짜"}</span>
                </li>
              ))}
            </ul>
            <div className="result-actions">
              <button className="btn btn-next" onClick={share}>
                {copied ? "복사 완료. 붙여넣기만 하면 됩니다" : "결과 복사해서 자랑하기"}
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        <footer className="sheet-footer">
          <span>이름만 보고 판단합니다. 검색은 반칙.</span>
          <span className="mono">내일 00:00 새 문제</span>
        </footer>
      </main>
    </div>
  );
}
