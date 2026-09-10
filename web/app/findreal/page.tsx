"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GridTile } from "@/components/GridTile";
import { CloseX } from "@/components/CloseX";
import { SoundToggle } from "@/components/SoundToggle";
import { applyComboPick, comboState } from "@/lib/local";
import { sfxCombo, sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";

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

  // 무한 라운드 (데일리 3라운드 후에도 콤보는 계속 이어진다)
  const [endless, setEndless] = useState(false);
  const [eOptions, setEOptions] = useState<string[] | null>(null);
  const [eCount, setECount] = useState(0);

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

  const options = endless ? eOptions : quiz?.items[idx]?.options;
  const roundNo = endless ? null : quiz?.items[idx]?.no;

  async function fetchEndless() {
    const res = await fetch("/api/endless/find");
    if (!res.ok) throw new Error("endless_failed");
    const data = (await res.json()) as { options: string[] };
    setEOptions(data.options);
  }

  async function startEndless() {
    sfxTap();
    setBusy(true);
    try {
      await fetchEndless();
      setEndless(true);
      setECount(0);
      setPicked(null);
      setReveal(null);
      setPhase("solve");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function pick(option: string) {
    if (!options || busy || phase !== "solve") return;
    setBusy(true);
    sfxTap();
    try {
      const res = endless
        ? await fetch("/api/endless/find", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ options, pick: option }),
          })
        : await fetch("/api/findreal/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: quiz!.date, no: roundNo, pick: option }),
          });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setPicked(option);
      setReveal(data);
      if (!endless) setMarks((m) => [...m, data.correct]);
      else setECount((c) => c + 1);
      if (data.correct) sfxStampRight();
      else sfxStampWrong();
      // 콤보는 데일리·무한 공통 기록 — 어디서든 이어지고 어디서든 끊긴다
      const next = applyComboPick(data.correct);
      setCombo(next);
      if (next.current >= 2) sfxCombo();
      setPhase("reveal");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    sfxTap();
    if (endless) {
      setBusy(true);
      try {
        await fetchEndless();
        setPicked(null);
        setReveal(null);
        setPhase("solve");
      } catch {
        setPhase("error");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!quiz) return;
    if (idx + 1 < quiz.items.length) {
      setIdx(idx + 1);
      setPicked(null);
      setReveal(null);
      setPhase("solve");
      return;
    }
    sfxResult();
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
    sfxTap();
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
            아파트 감별사<small>{endless ? "무한 찾기 감정서" : "진짜 찾기 감정서"}</small>
          </Link>
          <div className="head-right">
            {quiz && (
              <div className="issue mono">
                #{ep}
                <br />
                {mm}.{dd}
              </div>
            )}
            <CloseX inProgress={!endless && (phase === "solve" || phase === "reveal")} />
          </div>
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

        {(phase === "solve" || phase === "reveal") && options && (
          <section className="screen">
            <p className="qlabel mono">
              {endless
                ? `무한 ${eCount + (phase === "solve" ? 1 : 0)}라운드 · 연속 ${combo.current} · 최고 ${combo.best}`
                : `${String(idx + 1).padStart(2, "0")} / 03`}
            </p>
            <p className="pick-tip">
              이 중 <b>진짜는 하나</b>. 나머지 셋은 AI가 지은 이름입니다.
            </p>

            <div className="pick-list paper-in" key={endless ? `e${eCount}` : `d${idx}`}>
              {options.map((option) => {
                const isAnswer = reveal?.answer === option;
                const cls = phase === "reveal" ? `pick ${isAnswer ? "hit" : "miss"}` : "pick";
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
                  <button className="btn btn-next full" onClick={next} disabled={busy}>
                    {endless ? "다음 라운드 계속" : idx + 1 === quiz!.items.length ? "결과 보기" : "다음 라운드"}
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
            <div className="grid-line" role="img" aria-label={`3라운드 중 ${hits}라운드 적중`}>
              {marks.map((m, k) => (
                <span key={k} className="tile-in" style={{ animationDelay: `${k * 55}ms` }}>
                  <GridTile ok={m} />
                </span>
              ))}
            </div>
            <p className="grade-desc">
              {combo.current > 0
                ? `연속 ${combo.current}개 적중 중 · 최고 기록 ${combo.best}. 무한 라운드에서 이어가세요.`
                : combo.best > 0
                  ? `최고 기록 ${combo.best}. 무한 라운드에서 다시 쌓으세요.`
                  : "무한 라운드에서 첫 콤보를 시작하세요."}
            </p>
            <div className="result-actions">
              <button className="btn btn-next" onClick={startEndless} disabled={busy}>
                무한으로 계속 찾기 — 콤보 이어가기
              </button>
              <button className="btn btn-ghost" onClick={share}>
                {copied ? "복사 완료. 붙여넣기만 하면 됩니다" : "결과 복사해서 자랑하기"}
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        <footer className="sheet-footer">
          <SoundToggle />
          <span>{endless ? "오판하면 콤보가 끊깁니다. 신중하게." : "진짜 하나를 골라 누르세요"}</span>
          <span className="mono">{endless ? "무한 감정 중" : "내일 00:00 새 라운드"}</span>
        </footer>
      </main>
    </div>
  );
}
