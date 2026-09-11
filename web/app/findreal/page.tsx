"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GridTile } from "@/components/GridTile";
import { Stamp } from "@/components/Stamp";
import { CloseX } from "@/components/CloseX";
import { TimerBar } from "@/components/TimerBar";
import { findGradeFor } from "@/lib/grades";
import { applyComboPick, comboState, type ComboState } from "@/lib/local";
import { shareCardImage } from "@/lib/sharecard";
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

type Phase = "loading" | "solve" | "reveal" | "done" | "eresult" | "error";

const RESULT_KEY = "aptgam:findreal";
const TIME_LIMIT = 15; // 초 — 4개를 읽고 고를 시간

const fmtSec = (ms: number | null | undefined) =>
  ms == null ? null : `${(ms / 1000).toFixed(1)}초`;

export default function FindRealPage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CheckResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [combo, setCombo] = useState<ComboState>({ current: 0, best: 0 });
  const [busy, setBusy] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");

  // 무한 라운드 (콤보는 데일리·무한 공통으로 이어진다)
  const [endless, setEndless] = useState(false);
  const [eOptions, setEOptions] = useState<string[] | null>(null);
  const [eCount, setECount] = useState(0);
  const [sHits, setSHits] = useState(0);
  const [sMaxCombo, setSMaxCombo] = useState(0); // 세션 중 도달한 최고 콤보
  const sessionTimes = useRef<number[]>([]);
  const startBest = useRef(0);
  const qStart = useRef(0);

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

  useEffect(() => {
    if (phase === "solve") qStart.current = Date.now();
  }, [phase, idx, eCount]);

  const options = endless ? eOptions : quiz?.items[idx]?.options;
  const roundNo = endless ? null : quiz?.items[idx]?.no;
  const total = quiz?.items.length ?? 10;

  async function fetchEndless() {
    const res = await fetch("/api/endless/find");
    if (!res.ok) throw new Error("endless_failed");
    setEOptions(((await res.json()) as { options: string[] }).options);
  }

  async function startEndless() {
    sfxTap();
    setBusy(true);
    try {
      await fetchEndless();
      setEndless(true);
      setECount(0);
      setSHits(0);
      setSMaxCombo(0);
      sessionTimes.current = [];
      startBest.current = comboState().best;
      setPicked(null);
      setReveal(null);
      setPhase("solve");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  /** option=null이면 시간 초과 제출 */
  async function pick(option: string | null) {
    if (!options || busy || phase !== "solve") return;
    setBusy(true);
    if (option !== null) sfxTap();
    const dt = Date.now() - qStart.current;
    try {
      const res = endless
        ? await fetch("/api/endless/find", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(option === null ? { options, timeout: true } : { options, pick: option }),
          })
        : await fetch("/api/findreal/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              option === null ? { date: quiz!.date, no: roundNo, timeout: true } : { date: quiz!.date, no: roundNo, pick: option },
            ),
          });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setPicked(option);
      setReveal(data);
      setTimedOut(option === null);
      if (!endless) setMarks((m) => [...m, data.correct]);
      else {
        setECount((c) => c + 1);
        sessionTimes.current.push(dt);
        if (data.correct) setSHits((h) => h + 1);
      }
      if (data.correct) sfxStampRight();
      else sfxStampWrong();
      // 콤보는 데일리·무한 공통 기록 — 풀이 시간도 함께 쌓는다
      const next = applyComboPick(data.correct, dt);
      setCombo(next);
      if (endless) setSMaxCombo((m) => Math.max(m, next.current));
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
  const runAvg = combo.runCount ? fmtSec((combo.runTotalMs ?? 0) / combo.runCount) : null;
  const sessionAvgMs = () =>
    sessionTimes.current.length
      ? Math.round(sessionTimes.current.reduce((a, b) => a + b, 0) / sessionTimes.current.length)
      : null;

  function finishEndless() {
    sfxResult();
    setPhase("eresult");
  }


  const dGrade = findGradeFor(hits);

  async function shareImage() {
    if (!quiz || imgState === "busy") return;
    sfxTap();
    setImgState("busy");
    try {
      const result = await shareCardImage({
        episode: quiz.episode,
        date: quiz.date,
        subtitle: "진짜 찾기 감정 통지서",
        score: hits,
        total,
        marks,
        gradeName: dGrade.name,
        stats: [
          { value: `${combo.current}`, label: "유지 중인 콤보", accent: combo.current > 0 },
          { value: `${combo.best}`, label: "역대 최고 콤보" },
          { value: `${total - hits}번`, label: "AI에 속은 횟수" },
          { value: fmtSec(combo.bestAvgMs) ?? "-", label: "최고 기록 평균 판단" },
        ],
      });
      setImgState(result);
    } catch {
      setImgState("failed");
    }
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
            아파트 감별사
            <small>
              {endless ? "무한 찾기 감정서" : "진짜 찾기 감정서"}
              {quiz && ` · 제${ep}호 ${mm}.${dd}`}
            </small>
          </Link>
          <CloseX inProgress={!endless && (phase === "solve" || phase === "reveal")} />
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
                : `${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
            </p>
            <p className="pick-tip">
              이 중 <b>진짜는 하나</b>. 나머지 셋은 AI가 지은 이름입니다.
            </p>

            <TimerBar
              seconds={TIME_LIMIT}
              active={phase === "solve"}
              resetKey={endless ? `e${eCount}` : idx}
              onExpire={() => pick(null)}
            />

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
                  <span className="mark">{timedOut ? "시간 초과" : reveal.correct ? "적중" : "오판"}</span>
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
                      연속 <b>{combo.current}</b>개 적중 중{runAvg ? ` · 평균 ${runAvg}` : ""}
                      {combo.current >= combo.best && combo.best > 1 ? " · 최고 기록" : ""}
                    </>
                  ) : (
                    <>
                      콤보가 끊겼습니다 · 최고 {combo.best}
                      {fmtSec(combo.bestAvgMs) ? ` (평균 ${fmtSec(combo.bestAvgMs)})` : ""}
                    </>
                  )}
                </p>
                <div className="choices">
                  <button className="btn btn-next full" onClick={next} disabled={busy}>
                    {endless ? "다음 라운드 계속" : idx + 1 === total ? "결과 보기" : "다음 라운드"}
                  </button>
                  {endless && (
                    <button className="btn btn-ghost full" onClick={finishEndless} disabled={busy}>
                      여기까지 — 세션 결과 보기
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {phase === "eresult" && (
          <section className="screen result">
            <p className="score-label mono">무한 진짜 찾기 세션 결과</p>
            <p className="big">
              {sHits} / {eCount}
            </p>
            <p className="grade-desc">
              {sMaxCombo > startBest.current
                ? `신기록! 최고 콤보 ${sMaxCombo}. 어제의 나를 이겼습니다.`
                : combo.current > 0
                  ? `콤보 ${combo.current} 유지 중 — 다음 세션에서 이어집니다.`
                  : "콤보가 끊긴 채 마감. 다음 세션에서 다시 쌓으세요."}
            </p>
            <ul className="review">
              <li>
                <span className="nm">세션 중 최고 콤보</span>
                <span className="tag">{sMaxCombo}{sMaxCombo > startBest.current ? " · 신기록" : ""}</span>
              </li>
              <li>
                <span className="nm">평균 판단 시간</span>
                <span className="tag">{fmtSec(sessionAvgMs()) ?? "-"}</span>
              </li>
              <li>
                <span className="nm">역대 최고 콤보</span>
                <span className="tag">
                  {combo.best}
                  {fmtSec(combo.bestAvgMs) ? ` (평균 ${fmtSec(combo.bestAvgMs)})` : ""}
                </span>
              </li>
            </ul>
            <div className="result-actions">
              <button className="btn btn-next" onClick={startEndless} disabled={busy}>
                다시 무한 찾기 — 콤보 이어가기
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        {phase === "done" && quiz && (
          <section className="screen result">
            <p className="score-label mono">진짜 찾기 감정 결과</p>
            <p className="big">
              {hits} / {total}
            </p>
            <Stamp>{dGrade.name}</Stamp>
            <div className="grid-line" role="img" aria-label={`${total}라운드 중 ${hits}라운드 적중`}>
              {marks.map((m, k) => (
                <span key={k} className="tile-in" style={{ animationDelay: `${k * 55}ms` }}>
                  <GridTile ok={m} />
                </span>
              ))}
            </div>
            <p className="grade-desc">{dGrade.desc}</p>
            <p className="top-note">
              {combo.current > 0
                ? `연속 ${combo.current}개 적중 중 · 역대 최고 ${combo.best}`
                : `역대 최고 콤보 ${combo.best}${fmtSec(combo.bestAvgMs) ? ` (평균 ${fmtSec(combo.bestAvgMs)})` : ""}`}
            </p>
            <div className="result-actions">
              <button className="btn btn-next" onClick={shareImage} disabled={imgState === "busy"}>
                {imgState === "busy"
                  ? "통지서를 발급하는 중"
                  : imgState === "shared"
                    ? "공유 완료. 한 장 더 발급됩니다"
                    : imgState === "downloaded"
                      ? "저장 완료. 갤러리에서 확인하세요"
                      : imgState === "failed"
                        ? "발급 실패. 다시 시도해 주세요"
                        : "결과 통지서 이미지로 자랑하기"}
              </button>
              <button className="btn btn-next" onClick={startEndless} disabled={busy}>
                무한으로 계속 찾기 — 콤보 이어가기
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        <footer className="sheet-footer">
          <span>{endless ? "오판하면 콤보가 끊깁니다. 신중하게." : "진짜 하나를 골라 누르세요"}</span>
          <span className="mono">{endless ? "무한 감정 중" : "내일 00:00 새 라운드"}</span>
        </footer>
      </main>
    </div>
  );
}
