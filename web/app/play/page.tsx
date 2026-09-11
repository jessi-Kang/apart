"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GridTile } from "@/components/GridTile";
import { Stamp } from "@/components/Stamp";
import { CloseX } from "@/components/CloseX";
import { TimerBar } from "@/components/TimerBar";
import { gradeFor } from "@/lib/grades";
import { bumpStreak, bumpEndlessRecord, comboState, endlessRecord, loadResult, saveResult, type EndlessRecord, type ReviewItem, type SavedResult } from "@/lib/local";
import { shareCardImage } from "@/lib/sharecard";
import { sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";

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
  rate?: number | null;
  sample?: number;
}

type Phase = "loading" | "question" | "reveal" | "result" | "eresult" | "error";

const TIME_LIMIT = 12; // 초 — 이름 보고 직감으로 찍는 게임이라 짧게

const fmtSec = (ms: number | null | undefined) =>
  ms == null ? null : `${(ms / 1000).toFixed(1)}초`;

export default function PlayPage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [reveal, setReveal] = useState<AnswerResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [topPct, setTopPct] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");

  // 무한 감별 (데일리 완주 후 랜덤 새 문제 연속 — 집계 미반영)
  const [endless, setEndless] = useState(false);
  const [eq, setEq] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [eCount, setECount] = useState(0);
  const [eRec, setERec] = useState<EndlessRecord>({ best: 0, avgMs: null });
  const [sHits, setSHits] = useState(0); // 이번 세션 적중 수
  const [sBest, setSBest] = useState(0); // 이번 세션 최고 연속
  const qStart = useRef(0);
  const runTimes = useRef<number[]>([]); // 현재 연속 구간의 문제별 풀이 시간(ms)
  const sessionTimes = useRef<number[]>([]); // 이번 세션 전체 풀이 시간(ms)
  const startBest = useRef(0); // 세션 시작 시점의 역대 최고 (신기록 판정용)

  useEffect(() => {
    setERec(endlessRecord("ox"));
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

  useEffect(() => {
    if (phase === "question") qStart.current = Date.now();
  }, [phase, idx, eCount]);

  function restore(saved: SavedResult, date: string) {
    setMarks(saved.marks);
    setReview(saved.review);
    setStreak(bumpStreak(date));
    setPhase("result");
  }

  async function fetchEndless() {
    const res = await fetch("/api/endless/ox");
    if (!res.ok) throw new Error("endless_failed");
    setEq(((await res.json()) as { name: string }).name);
  }

  async function startEndless() {
    sfxTap();
    setBusy(true);
    try {
      await fetchEndless();
      setEndless(true);
      setRun(0);
      setECount(0);
      setSHits(0);
      setSBest(0);
      runTimes.current = [];
      sessionTimes.current = [];
      startBest.current = endlessRecord("ox").best;
      setReveal(null);
      setPhase("question");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  const runAvgMs = () =>
    runTimes.current.length ? Math.round(runTimes.current.reduce((a, b) => a + b, 0) / runTimes.current.length) : null;
  const sessionAvgMs = () =>
    sessionTimes.current.length
      ? Math.round(sessionTimes.current.reduce((a, b) => a + b, 0) / sessionTimes.current.length)
      : null;

  function finishEndless() {
    sfxResult();
    setPhase("eresult");
  }


  async function answer(choice: "real" | "fake" | "timeout") {
    if (busy || phase !== "question") return;
    setBusy(true);
    if (choice !== "timeout") sfxTap();
    const dt = Date.now() - qStart.current;
    try {
      if (endless) {
        if (!eq) throw new Error("no_question");
        const res = await fetch("/api/endless/ox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: eq, choice }),
        });
        if (!res.ok) throw new Error("answer_failed");
        const data = (await res.json()) as AnswerResponse;
        setReveal(data);
        setTimedOut(choice === "timeout");
        setECount((c) => c + 1);
        sessionTimes.current.push(dt);
        if (data.correct) {
          runTimes.current.push(dt);
          const nextRun = run + 1;
          setRun(nextRun);
          setSHits((h) => h + 1);
          setSBest((b) => Math.max(b, nextRun));
          setERec(bumpEndlessRecord("ox", nextRun, runAvgMs()));
          sfxStampRight();
        } else {
          runTimes.current = [];
          setRun(0);
          sfxStampWrong();
        }
        setPhase("reveal");
        return;
      }
      if (!quiz) return;
      const item = quiz.items[idx];
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: quiz.date, no: item.no, choice }),
      });
      if (!res.ok) throw new Error("answer_failed");
      const data = (await res.json()) as AnswerResponse;
      setReveal(data);
      setTimedOut(choice === "timeout");
      setMarks((m) => [...m, data.correct]);
      setReview((r) => [...r, { no: item.no, name: item.name, kind: data.kind, correct: data.correct }]);
      if (data.correct) sfxStampRight();
      else sfxStampWrong();
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
        setReveal(null);
        setPhase("question");
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
      setReveal(null);
      setPhase("question");
      return;
    }
    sfxResult();
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

  async function shareImage() {
    if (!quiz || imgState === "busy") return;
    sfxTap();
    setImgState("busy");
    try {
      const result = await shareCardImage({
        episode: quiz.episode,
        date: quiz.date,
        score,
        marks,
        gradeName: grade.name,
        topPct,
        streak,
        bestCombo: comboState().best,
      });
      setImgState(result);
    } catch {
      setImgState("failed");
    }
  }

  const ep = quiz?.episode ?? "";
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");
  const currentName = endless ? eq : quiz?.items[idx]?.name;

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
            아파트 감별사
            <small>
              {endless ? "무한 감별 접수증" : "진짜 단지명 판별 접수증"}
              {quiz && ` · 제${ep}호 ${mm}.${dd}`}
            </small>
          </Link>
          <CloseX inProgress={!endless && (phase === "question" || phase === "reveal") && marks.length < 10} />
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

        {(phase === "question" || phase === "reveal") && currentName && (
          <section className="screen">
            {endless ? (
              <p className="qlabel mono">
                무한 {eCount + (phase === "question" ? 1 : 0)}번째 · 연속 {run} · 최고 {eRec.best}
              </p>
            ) : (
              <>
                <div className="progress" aria-hidden="true">
                  {quiz!.items.map((_, k) => (
                    <i key={k} className={k < idx ? "done" : k === idx ? "now" : ""} />
                  ))}
                </div>
                <p className="qlabel mono">
                  {String(idx + 1).padStart(2, "0")} / 10
                </p>
              </>
            )}
            <div className="qname-wrap paper-in" key={`${endless ? "e" : "d"}-${endless ? eCount : idx}`}>
              <h2 className="qname">{currentName}</h2>
            </div>

            <TimerBar
              seconds={TIME_LIMIT}
              active={phase === "question"}
              resetKey={endless ? `e${eCount}` : idx}
              onExpire={() => answer("timeout")}
            />

            {phase === "reveal" && reveal && (
              <div className={`verdict ${reveal.correct ? "right" : "wrong"}`}>
                <span className="mark">{timedOut ? "시간 초과" : reveal.correct ? "정답" : "오답"}</span>
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
                  {endless
                    ? reveal.correct
                      ? `연속 ${run}문제 · 평균 ${fmtSec(runAvgMs()) ?? "-"} · 최고 ${eRec.best}${fmtSec(eRec.avgMs) ? ` (${fmtSec(eRec.avgMs)})` : ""}`
                      : `연속이 끊겼습니다 · 최고 ${eRec.best}${fmtSec(eRec.avgMs) ? ` (평균 ${fmtSec(eRec.avgMs)})` : ""}`
                    : reveal.rate != null
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
                <button className="btn btn-next full" onClick={next} disabled={busy}>
                  {endless ? "다음 문제 계속" : idx + 1 === quiz!.items.length ? "감별 등급 확인" : "다음 문제"}
                </button>
                {endless && (
                  <button className="btn btn-ghost full" onClick={finishEndless} disabled={busy}>
                    여기까지 — 세션 결과 보기
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {phase === "eresult" && (
          <section className="screen result">
            <p className="score-label mono">무한 감별 세션 결과</p>
            <p className="big">
              {sHits} / {eCount}
            </p>
            <p className="grade-desc">
              {sBest > startBest.current
                ? `신기록! 최고 연속 ${sBest}. 어제의 나를 이겼습니다.`
                : eCount > 0 && sHits / eCount >= 0.8
                  ? "감별력이 물이 올랐습니다. 기록까지 조금 남았습니다."
                  : eCount > 0 && sHits / eCount >= 0.5
                    ? "반타작 이상. AI 작명도 만만치 않죠."
                    : "AI가 오늘은 한 수 위였습니다. 설욕전을 권합니다."}
            </p>
            <ul className="review">
              <li>
                <span className="nm">이번 세션 최고 연속</span>
                <span className="tag">{sBest}{sBest > startBest.current ? " · 신기록" : ""}</span>
              </li>
              <li>
                <span className="nm">평균 풀이 시간</span>
                <span className="tag">{fmtSec(sessionAvgMs()) ?? "-"}</span>
              </li>
              <li>
                <span className="nm">역대 최고 연속</span>
                <span className="tag">
                  {eRec.best}
                  {fmtSec(eRec.avgMs) ? ` (평균 ${fmtSec(eRec.avgMs)})` : ""}
                </span>
              </li>
            </ul>
            <div className="result-actions">
              <button className="btn btn-next" onClick={startEndless} disabled={busy}>
                다시 무한 감별 — 기록 깨러 가기
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
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
                <span key={k} className="tile-in" style={{ animationDelay: `${k * 55}ms` }}>
                  <GridTile ok={m} />
                </span>
              ))}
            </div>
            <p className="top-note">
              {topPct !== null && (
                <>
                  오늘 전국 상위 <b>{topPct}%</b> ·{" "}
                </>
              )}
              {streak > 0 && <>{streak}일 연속 감별 중 · </>}
              무한 감별 최고 연속 {eRec.best}
              {fmtSec(eRec.avgMs) ? ` (평균 ${fmtSec(eRec.avgMs)})` : ""}
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
                무한 감별 시작 — 랜덤 새 문제
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        <footer className="sheet-footer">
          <span>{endless ? "틀려도 계속됩니다. 연속 기록에 도전하세요." : "이름만 보고 판단합니다. 검색은 반칙."}</span>
          <span className="mono">{endless ? "무한 감별 중" : "내일 00:00 새 문제"}</span>
        </footer>
      </main>
    </div>
  );
}
