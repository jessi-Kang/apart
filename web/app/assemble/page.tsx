"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GridTile } from "@/components/GridTile";
import { CountUp, GradeLadder, RecordGauge } from "@/components/ResultExtras";
import { LevelBar } from "@/components/LevelBar";
import { Seal } from "@/components/Seal";
import { Stamp } from "@/components/Stamp";
import { CloseX } from "@/components/CloseX";
import { SheetFooter } from "@/components/SheetFooter";
import { TimerBar } from "@/components/TimerBar";
import { assembleGradeFor, ASSEMBLE_GRADES } from "@/lib/grades";
import { bumpEndlessRecord, endlessRecord, type EndlessRecord } from "@/lib/local";
import { addXp, type XpResult } from "@/lib/level";
import { shareCardImage } from "@/lib/sharecard";
import { sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";

interface Puzzle {
  no: number;
  pieces: string[];
  answerLen: number;
  hint: { location: string; builtYear: number; households: number };
}

interface EndlessPuzzle {
  id: string;
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

type Phase = "loading" | "solve" | "reveal" | "done" | "eresult" | "error";

const RESULT_KEY = "aptgam:assemble";
const TIME_LIMIT = 40; // 초 — 조각을 읽고 조립할 시간이 필요하다

const fmtSec = (ms: number | null | undefined) =>
  ms == null ? null : `${(ms / 1000).toFixed(1)}초`;

export default function AssemblePage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [reveal, setReveal] = useState<CheckResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");
  const [eImgState, setEImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");
  const [xpRes, setXpRes] = useState<XpResult | null>(null);
  const [eXpRes, setEXpRes] = useState<XpResult | null>(null);

  // 초성 힌트 (시간이 지나면 자동 공개, 본편에선 본 만큼 감점)
  const [hintMask, setHintMask] = useState<string | null>(null);
  const [hintTier, setHintTier] = useState(0);
  // 속도 점수 (본편): 빨리 맞출수록 높고, 힌트를 본 만큼 깎인다
  const [points, setPoints] = useState(0);
  const [lastPts, setLastPts] = useState(0);

  // 무한 조립
  const [endless, setEndless] = useState(false);
  const [epz, setEpz] = useState<EndlessPuzzle | null>(null);
  const [run, setRun] = useState(0);
  const [eCount, setECount] = useState(0);
  const [eRec, setERec] = useState<EndlessRecord>({ best: 0, avgMs: null });
  const [sHits, setSHits] = useState(0);
  const [sBest, setSBest] = useState(0);
  const [sMarks, setSMarks] = useState<boolean[]>([]); // 세션 라운드별 판정 (공유 카드 그리드)
  const runTimes = useRef<number[]>([]);
  const sessionTimes = useRef<number[]>([]);
  const startBest = useRef(0);
  const qStart = useRef(0);

  useEffect(() => {
    setERec(endlessRecord("assemble"));
    fetch("/api/assemble/today")
      .then((r) => r.json())
      .then((data: TodayResponse) => {
        setQuiz(data);
        try {
          const saved = JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null") as {
            date: string;
            marks: boolean[];
            points?: number;
          } | null;
          // 문제 수가 바뀐 날의 옛 저장본(3문제 시절 등)은 버리고 새로 풀게 한다
          if (saved && saved.date === data.date && saved.marks.length === data.items.length) {
            // 오늘 완주분은 결과 재방영 대신 곧장 무한 조립으로
            void startEndless();
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

  const puzzle: Puzzle | EndlessPuzzle | undefined = endless ? (epz ?? undefined) : quiz?.items[idx];

  // 초성 힌트 자동 공개: 15초 → 1글자, 25초 → 2글자, 33초 → 3글자
  useEffect(() => {
    setHintMask(null);
    setHintTier(0);
    if (phase !== "solve" || !puzzle) return;
    const timers = [15_000, 25_000, 33_000].map((delay, i) =>
      setTimeout(async () => {
        try {
          const url = endless
            ? `/api/endless/assemble/hint?id=${encodeURIComponent((puzzle as EndlessPuzzle).id)}&tier=${i + 1}`
            : `/api/assemble/hint?no=${(puzzle as Puzzle).no}&tier=${i + 1}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const { mask } = (await res.json()) as { mask: string };
          setHintMask(mask);
          setHintTier(i + 1);
        } catch {
          /* 힌트 실패는 게임 진행에 영향 없음 */
        }
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, eCount, endless]);

  async function fetchEndless() {
    const res = await fetch("/api/endless/assemble");
    if (!res.ok) throw new Error("endless_failed");
    setEpz((await res.json()) as EndlessPuzzle);
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
      setSMarks([]);
      setEImgState("idle");
      runTimes.current = [];
      sessionTimes.current = [];
      startBest.current = endlessRecord("assemble").best;
      setPicked([]);
      setReveal(null);
      setPhase("solve");
    } catch {
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  function pick(k: number) {
    if (!puzzle || phase !== "solve" || picked.includes(k) || picked.length >= puzzle.answerLen) return;
    sfxTap();
    setPicked((p) => [...p, k]);
  }
  function unpick(slot: number) {
    if (phase !== "solve") return;
    sfxTap();
    setPicked((p) => p.filter((_, i) => i !== slot));
  }

  const runAvgMs = () =>
    runTimes.current.length ? Math.round(runTimes.current.reduce((a, b) => a + b, 0) / runTimes.current.length) : null;
  const sessionAvgMs = () =>
    sessionTimes.current.length
      ? Math.round(sessionTimes.current.reduce((a, b) => a + b, 0) / sessionTimes.current.length)
      : null;

  function finishEndless() {
    sfxResult();
    setEXpRes(addXp(sHits * 8 + (sBest > startBest.current ? 30 : 0)));
    setPhase("eresult");
  }


  /** fromTimeout=true면 미완성 조립이라도 그대로 제출한다 (시간 초과) */
  async function check(fromTimeout = false) {
    if (!puzzle || busy || phase !== "solve") return;
    if (!fromTimeout && picked.length !== puzzle.answerLen) return;
    setBusy(true);
    if (!fromTimeout) sfxTap();
    const dt = Date.now() - qStart.current;
    try {
      const guess = picked.map((k) => puzzle.pieces[k]);
      const res = endless
        ? await fetch("/api/endless/assemble", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: (puzzle as EndlessPuzzle).id, guess }),
          })
        : await fetch("/api/assemble/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: quiz!.date, no: (puzzle as Puzzle).no, guess }),
          });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setReveal(data);
      setTimedOut(fromTimeout && !data.correct);
      if (endless) {
        setECount((c) => c + 1);
        setSMarks((m) => [...m, data.correct]);
        sessionTimes.current.push(dt);
        if (data.correct) {
          runTimes.current.push(dt);
          const nextRun = run + 1;
          setRun(nextRun);
          setSHits((h) => h + 1);
          setSBest((b) => Math.max(b, nextRun));
          setERec(bumpEndlessRecord("assemble", nextRun, runAvgMs()));
          sfxStampRight();
        } else {
          runTimes.current = [];
          setRun(0);
          sfxStampWrong();
        }
      } else {
        setMarks((m) => [...m, data.correct]);
        // 속도 점수: 기본 10 + 남은 시간 보너스(4초당 1, 최대 10) − 힌트 감점(개당 4)
        const remainSec = Math.max(0, TIME_LIMIT - dt / 1000);
        const pts = data.correct ? Math.max(2, 10 + Math.round(remainSec / 4) - hintTier * 4) : 0;
        setLastPts(pts);
        setPoints((p) => p + pts);
        if (data.correct) sfxStampRight();
        else sfxStampWrong();
      }
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
        setPicked([]);
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
      setPicked([]);
      setReveal(null);
      setPhase("solve");
      return;
    }
    sfxResult();
    try {
      localStorage.setItem(RESULT_KEY, JSON.stringify({ date: quiz.date, marks, points }));
    } catch {
      /* 무시 */
    }
    setXpRes(addXp(points + 20)); // 속도·힌트가 반영된 조립 점수 + 완주 20점
    setPhase("done");
  }

  const success = marks.filter(Boolean).length;
  const total = quiz?.items.length ?? 10;
  const dGrade = assembleGradeFor(success);

  async function shareImage() {
    if (!quiz || imgState === "busy") return;
    sfxTap();
    setImgState("busy");
    try {
      const result = await shareCardImage({
        episode: quiz.episode,
        date: quiz.date,
        subtitle: "이름 조립 통지서",
        score: success,
        total,
        marks,
        gradeName: dGrade.name,
        stats: [
          { value: `${points}점`, label: "조립 점수 (속도·힌트 반영)", accent: true },
          { value: `${total - success}번`, label: "함정에 속은 횟수" },
          {
            value: `${eRec.best}`,
            label: `무한 조립 최고 연속${fmtSec(eRec.avgMs) ? ` (평균 ${fmtSec(eRec.avgMs)})` : ""}`,
          },
          { value: `+${xpRes?.gained ?? 0}점`, label: "오늘 획득 경험치" },
        ],
      });
      setImgState(result);
    } catch {
      setImgState("failed");
    }
  }

  const ep = quiz?.episode ?? "";
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");

  async function shareEndlessImage() {
    if (!quiz || eImgState === "busy") return;
    sfxTap();
    setEImgState("busy");
    try {
      const rate = eCount > 0 ? sHits / eCount : 0;
      const result = await shareCardImage({
        episode: quiz.episode,
        date: quiz.date,
        subtitle: "무한 조립 통지서",
        headerRight: `무한 조립 · ${mm}.${dd}`,
        score: sBest,
        total: eCount,
        totalText: "연속",
        marks: sMarks.slice(-10),
        gradeName: sBest > startBest.current ? "신기록 갱신" : rate >= 0.7 ? "조립 숙련" : "조립 수련",
        stats: [
          { value: `${sHits}/${eCount}`, label: "이번 세션 적중" },
          { value: fmtSec(sessionAvgMs()) ?? "-", label: "평균 조립 시간" },
          { value: `${Math.max(eRec.best, sBest)}`, label: "역대 최고 연속", accent: sBest > startBest.current },
          { value: `+${eXpRes?.gained ?? 0}점`, label: "획득 경험치" },
        ],
      });
      setEImgState(result);
    } catch {
      setEImgState("failed");
    }
  }

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
        <p className="note">조각에는 함정이 섞여 있습니다.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사
            <small>
              {endless ? "무한 조립 신청서" : "이름 조립 신청서"}
              {quiz && ` · 제${ep}호 ${mm}.${dd}`}
            </small>
          </Link>
          <CloseX
              inProgress={!endless && (phase === "solve" || phase === "reveal")}
              onClose={endless && (phase === "solve" || phase === "reveal") && eCount > 0 ? finishEndless : undefined}
            />
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

        {(phase === "solve" || phase === "reveal") && puzzle && (
          <section className="screen">
            <p className="qlabel mono">
              {endless
                ? `무한 ${eCount + (phase === "solve" ? 1 : 0)}번째 · 연속 ${run} · 최고 ${eRec.best}`
                : `${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
            </p>
            <div className="hintcard paper-in" key={endless ? `e${eCount}` : (puzzle as Puzzle).no}>
              이 단지를 조립하세요: <b>{puzzle.hint.location}</b>
              <br />
              {puzzle.hint.builtYear}년 준공 · {puzzle.hint.households.toLocaleString()}세대
              {phase === "solve" && hintMask && (
                <p className="choseong">
                  <span className="mono">{hintMask}</span>
                  {!endless && <small>힌트 공개마다 −4점</small>}
                </p>
              )}
            </div>

            <TimerBar
              seconds={TIME_LIMIT}
              active={phase === "solve"}
              resetKey={endless ? `e${eCount}` : idx}
              onExpire={() => check(true)}
            />

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
              <>
                <div className={`verdict ${reveal.correct ? "right" : "wrong"}`}>
                  <span className="mark">
                    {timedOut ? "시간 초과" : reveal.correct ? (endless ? "정답" : `정답 +${lastPts}점`) : "오답"}
                  </span>
                  <h3>{reveal.answer}</h3>
                  <p className="meta">
                    {reveal.meta.location}
                    <br />
                    {reveal.meta.builtYear}년 준공 · {reveal.meta.households.toLocaleString()}세대
                  </p>
                </div>
                {endless && (
                  <p className="combo-line">
                    {reveal.correct ? (
                      <>
                        연속 <b>{run}</b>개 · 평균 {fmtSec(runAvgMs()) ?? "-"} · 최고 {eRec.best}
                        {fmtSec(eRec.avgMs) ? ` (${fmtSec(eRec.avgMs)})` : ""}
                      </>
                    ) : (
                      <>
                        연속이 끊겼습니다 · 최고 {eRec.best}
                        {fmtSec(eRec.avgMs) ? ` (평균 ${fmtSec(eRec.avgMs)})` : ""}
                      </>
                    )}
                  </p>
                )}
              </>
            )}

            {phase === "solve" ? (
              <div className="choices">
                <button className="btn btn-ghost" onClick={() => { sfxTap(); setPicked([]); }}>
                  비우기
                </button>
                <button className="btn btn-next" onClick={() => check()} disabled={busy || picked.length !== puzzle.answerLen}>
                  확인
                </button>
              </div>
            ) : (
              <div className="choices">
                <button className="btn btn-next full" onClick={next} disabled={busy}>
                  {endless ? "다음 퍼즐 계속" : idx + 1 === total ? "결과 보기" : "다음 문제"}
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
            <div className="result-seal" aria-hidden="true">
              <Seal size={230} />
            </div>
            <p className="score-label mono">무한 조립 세션 결과</p>
            <p className="big">
              <CountUp value={sHits} /> / {eCount}
            </p>
            <p className="grade-desc">
              {sBest > startBest.current
                ? `신기록! 최고 연속 ${sBest}. 조립 손맛이 올라왔습니다.`
                : eCount > 0 && sHits / eCount >= 0.7
                  ? "함정 조각이 안 통하는 수준입니다."
                  : "함정 조각의 승리. 다음 세션에서 설욕을."}
            </p>
            <RecordGauge session={sBest} best={startBest.current} />
            <LevelBar result={eXpRes} />
            <div className="result-actions">
              <button className="btn btn-next" onClick={shareEndlessImage} disabled={eImgState === "busy"}>
                {eImgState === "busy"
                  ? "발급 중"
                  : eImgState === "shared"
                    ? "공유 완료"
                    : eImgState === "downloaded"
                      ? "저장 완료"
                      : eImgState === "failed"
                        ? "다시 시도"
                        : "세션 통지서 공유"}
              </button>
              <button className="btn btn-ghost" onClick={startEndless} disabled={busy}>
                다시 도전
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        {phase === "done" && quiz && (
          <section className="screen result">
            <div className="result-seal" aria-hidden="true">
              <Seal size={230} />
            </div>
            <p className="score-label mono">이름 조립 결과</p>
            <p className="big">
              <CountUp value={success} /> / {total}
            </p>
            <Stamp>{dGrade.name}</Stamp>
            <p className="grade-desc">{dGrade.desc}</p>
            <GradeLadder grades={ASSEMBLE_GRADES} score={success} />
            <LevelBar result={xpRes} />
            <div className="grid-line" role="img" aria-label={`${total}문제 중 ${success}문제 조립 성공`}>
              {marks.map((m, k) => (
                <span key={k} className="tile-in" style={{ animationDelay: `${k * 55}ms` }}>
                  <GridTile ok={m} />
                </span>
              ))}
            </div>
            <p className="top-note">
              이번 판 <b>{points}점</b> · 빠를수록, 힌트 없이 맞출수록 높습니다
            </p>
            <div className="result-actions">
              <button className="btn btn-next" onClick={shareImage} disabled={imgState === "busy"}>
                {imgState === "busy"
                  ? "발급 중"
                  : imgState === "shared"
                    ? "공유 완료"
                    : imgState === "downloaded"
                      ? "저장 완료"
                      : imgState === "failed"
                        ? "다시 시도"
                        : "통지서 이미지 공유"}
              </button>
              <button className="btn btn-ghost" onClick={startEndless} disabled={busy}>
                무한 조립 계속
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        <SheetFooter />
      </main>
    </div>
  );
}
