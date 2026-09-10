"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Puzzle {
  no: number;
  pieces: string[];
  answerLen: number;
  hint: { location: string; builtYear: number; households: number };
}

interface TodayResponse {
  date: string;
  episode: number;
  items: Puzzle[];
}

interface CheckResponse {
  correct: boolean;
  answer: string;
  meta: { location: string; builtYear: number; households: number };
}

type Phase = "loading" | "solve" | "reveal" | "done" | "error";

const RESULT_KEY = "aptgam:assemble";

export default function AssemblePage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [reveal, setReveal] = useState<CheckResponse | null>(null);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/assemble/today")
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

  const puzzle = quiz?.items[idx];

  function pick(k: number) {
    if (!puzzle || phase !== "solve" || picked.includes(k) || picked.length >= puzzle.answerLen) return;
    setPicked((p) => [...p, k]);
  }
  function unpick(slot: number) {
    if (phase !== "solve") return;
    setPicked((p) => p.filter((_, i) => i !== slot));
  }

  async function check() {
    if (!quiz || !puzzle || busy || picked.length !== puzzle.answerLen) return;
    setBusy(true);
    try {
      const res = await fetch("/api/assemble/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: quiz.date, no: puzzle.no, guess: picked.map((k) => puzzle.pieces[k]) }),
      });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setReveal(data);
      setMarks((m) => [...m, data.correct]);
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
      setPicked([]);
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

  const success = marks.filter(Boolean).length;

  function share() {
    if (!quiz) return;
    const grid = marks.map((m) => (m ? "🟩" : "⬛")).join("");
    const text = `아파트 감별사 #${quiz.episode} 이름 조립 🧩\n${grid} ${success}/3 조립 성공\n${location.origin}`;
    navigator.clipboard?.writeText(text).then(() => setCopied(true));
  }

  const ep = quiz?.episode ?? "";
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          힌트를 보고
          <br />
          실존 단지명을 <em>조립</em>하십시오
        </h2>
        {quiz && (
          <p className="date mono">
            제{ep}호 / {Number(mm)}월 {Number(dd)}일
          </p>
        )}
        <p className="note">
          조각에는 함정이 섞여 있습니다.
          <br />
          매일 자정에 새 3문제가 나옵니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>이름 조립 신청서</small>
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
            <p className="center-note">오늘의 조립 문제를 준비하고 있습니다</p>
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

        {(phase === "solve" || phase === "reveal") && quiz && puzzle && (
          <section className="screen">
            <p className="qlabel mono">
              {String(idx + 1).padStart(2, "0")} / 03
            </p>
            <div className="hintcard paper-in" key={puzzle.no}>
              이 단지를 조립하세요: <b>{puzzle.hint.location}</b>
              <br />
              {puzzle.hint.builtYear}년 준공 · {puzzle.hint.households.toLocaleString()}세대
            </div>

            <div className="slots">
              {Array.from({ length: puzzle.answerLen }, (_, k) => {
                const p = picked[k];
                return (
                  <button
                    key={k}
                    className={`slot ${p !== undefined ? "filled" : ""}`}
                    onClick={() => unpick(k)}
                    aria-label={`칸 ${k + 1}`}
                  >
                    {p !== undefined ? puzzle.pieces[p] : ""}
                  </button>
                );
              })}
            </div>
            <div className="pool">
              {puzzle.pieces.map((t, k) => (
                <button key={k} className={`tile ${picked.includes(k) ? "used" : ""}`} onClick={() => pick(k)}>
                  {t}
                </button>
              ))}
            </div>

            {phase === "reveal" && reveal && (
              <div className={`verdict ${reveal.correct ? "right" : "wrong"}`}>
                <span className="mark">{reveal.correct ? "정답" : "오답"}</span>
                <h3>{reveal.answer}</h3>
                <p className="meta">
                  {reveal.meta.location}
                  <br />
                  {reveal.meta.builtYear}년 준공 · {reveal.meta.households.toLocaleString()}세대
                </p>
              </div>
            )}

            {phase === "solve" ? (
              <div className="choices">
                <button className="btn btn-ghost" onClick={() => setPicked([])}>
                  비우기
                </button>
                <button className="btn btn-next" onClick={check} disabled={busy || picked.length !== puzzle.answerLen}>
                  확인
                </button>
              </div>
            ) : (
              <div className="choices">
                <button className="btn btn-next full" onClick={next}>
                  {idx + 1 === quiz.items.length ? "결과 보기" : "다음 문제"}
                </button>
              </div>
            )}
          </section>
        )}

        {phase === "done" && quiz && (
          <section className="screen result">
            <p className="score-label mono">이름 조립 결과</p>
            <p className="big">{success} / 3</p>
            <p className="grade-desc">
              {success === 3
                ? "설계도 없이도 조립하는 수준. 완벽합니다."
                : success >= 1
                  ? "감은 잡혔습니다. 내일 새 문제로 다시 오세요."
                  : "함정 조각에 전부 속았습니다. 내일 설욕전을."}
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
          <span>조각을 순서대로 눌러 이름을 완성하세요</span>
          <span className="mono">내일 00:00 새 문제</span>
        </footer>
      </main>
    </div>
  );
}
