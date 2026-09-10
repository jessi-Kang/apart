"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { applyComboPick, comboState } from "@/lib/local";

interface Round {
  no: number;
  options: string[];
}

interface TodayResponse {
  date: string;
  episode: number;
  items: Round[];
}

interface CheckResponse {
  correct: boolean;
  answer: string;
  meta: { location: string; builtYear: number; households: number };
}

type Phase = "loading" | "solve" | "reveal" | "done" | "error";

const RESULT_KEY = "aptgam:findreal";

export default function FindRealPage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CheckResponse | null>(null);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [combo, setCombo] = useState({ current: 0, best: 0 });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCombo(comboState());
    fetch("/api/findreal/today")
      .then((r) => r.json())
      .then((data: TodayResponse) => {
        setQuiz(data);
        try {
          const saved = JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null") as {
            date: string;
            marks: boolean[];
          } | null;
          if (saved && saved.date === data.date) {
            setMarks(saved.marks);
            setPhase("done");
            return;
          }
        } catch {
          /* 무시 */
        }
        setPhase("solve");
      })
      .catch(() => setPhase("error"));
  }, []);

  const round = quiz?.items[idx];

  async function pick(option: string) {
    if (!quiz || !round || busy || phase !== "solve") return;
    setBusy(true);
    try {
      const res = await fetch("/api/findreal/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: quiz.date, no: round.no, pick: option }),
      });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setPicked(option);
      setReveal(data);
      setMarks((m) => [...m, data.correct]);
      setCombo(applyComboPick(data.correct));
      setPhase("reveal");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!quiz) return;
    if (idx + 1 < quiz.items.length) {
      setIdx(idx + 1);
      setPicked(null);
      setReveal(null);
      setPhase("solve");
      return;
    }
    try {
      localStorage.setItem(RESULT_KEY, JSON.stringify({ date: quiz.date, marks }));
    } catch {
      /* 무시 */
    }
    setPhase("done");
  }

  const hits = marks.filter(Boolean).length;

  function share() {
    if (!quiz) return;
    const grid = marks.map((m) => (m ? "🟩" : "⬛")).join("");
    const comboLine = combo.current > 0 ? ` · 연속 ${combo.current}개 적중 중` : "";
    const text = `아파트 감별사 #${quiz.episode} 진짜 찾기 🎯\n${grid} ${hits}/3 적중${comboLine} (최고 ${combo.best})\n${location.origin}`;
    navigator.clipboard?.writeText(text).then(() => setCopied(true));
  }

  const ep = quiz?.episode ?? "";
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          넷 중 진짜는
          <br />
          <em>하나</em>뿐입니다
        </h2>
        {quiz && (
          <p className="date mono">
            제{ep}호 / {Number(mm)}월 {Number(dd)}일
          </p>
        )}
        <p className="note">
          나머지 셋은 AI 작품입니다.
          <br />
          연속 적중 콤보는 내일로 이어집니다.
          <br />
          오판하면 콤보가 끊깁니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>진짜 찾기 감정서</small>
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
            <p className="center-note">오늘의 감정 대상을 준비하고 있습니다</p>
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

        {(phase === "solve" || phase === "reveal") && quiz && round && (
          <section className="screen">
            <p className="qlabel mono">
              {String(idx + 1).padStart(2, "0")} / 03
            </p>
            <p className="pick-tip">
              이 중 <b>진짜는 하나</b>. 나머지 셋은 AI가 지은 이름입니다.
            </p>

            <div className="pick-list">
              {round.options.map((option) => {
                const isAnswer = reveal?.answer === option;
                const cls =
                  phase === "reveal" ? `pick ${isAnswer ? "hit" : "miss"}` : "pick";
                return (
                  <button
                    key={option}
                    className={cls}
                    onClick={() => pick(option)}
                    disabled={busy || phase === "reveal"}
                    aria-pressed={picked === option}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {phase === "reveal" && reveal && (
              <>
                <div className={`verdict ${reveal.correct ? "right" : "wrong"}`}>
                  <span className="mark">{reveal.correct ? "적중" : "오판"}</span>
                  <h3>진짜는 &ldquo;{reveal.answer}&rdquo;</h3>
                  <p className="meta">
                    {reveal.meta.location}
                    <br />
                    {reveal.meta.builtYear}년 준공 · {reveal.meta.households.toLocaleString()}세대
                  </p>
                </div>
                <p className="combo-line">
                  {reveal.correct ? (
                    <>
                      연속 <b>{combo.current}</b>개 적중 중{combo.current >= combo.best && combo.best > 1 ? " · 최고 기록" : ""}
                    </>
                  ) : (
                    <>콤보가 끊겼습니다. 최고 기록 {combo.best}</>
                  )}
                </p>
                <div className="choices">
                  <button className="btn btn-next full" onClick={next}>
                    {idx + 1 === quiz.items.length ? "결과 보기" : "다음 라운드"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {phase === "done" && quiz && (
          <section className="screen result">
            <p className="score-label mono">진짜 찾기 감정 결과</p>
            <p className="big">{hits} / 3</p>
            <p className="grade-desc">
              {combo.current > 0
                ? `연속 ${combo.current}개 적중 중 · 최고 기록 ${combo.best}. 내일 이어집니다.`
                : combo.best > 0
                  ? `최고 기록 ${combo.best}. 내일 새 라운드로 다시 쌓으세요.`
                  : "내일 새 라운드에서 첫 콤보를 시작하세요."}
            </p>
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
          <span>진짜 하나를 골라 누르세요</span>
          <span className="mono">내일 00:00 새 라운드</span>
        </footer>
      </main>
    </div>
  );
}
