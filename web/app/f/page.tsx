"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LevelBar } from "@/components/LevelBar";
import { DocTitle, MiniGrid, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { CloseX } from "@/components/CloseX";
import { SoundToggle } from "@/components/SoundToggle";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { RuleButton, RuleOverlay, useGuide } from "@/components/RuleNote";
import { TimerBar } from "@/components/TimerBar";
import { findGradeFor } from "@/lib/grades";
import { applyComboPick, areaPref, comboState, type ComboState } from "@/lib/local";
import { addXp, type XpResult } from "@/lib/level";
import { FINISH_BONUS, RECORD_BONUS, questionScore } from "@/lib/scoring";
import { shareCardImage, type ShareCardData } from "@/lib/sharecard";
import { ShareLink } from "@/components/ShareLink";
import { sfxCombo, sfxRecord, sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";

interface Round {
  no: number;
  options: string[];
}

interface TodayResponse {
  date: string;
  episode: number;
  /** 서버가 실제로 적용한 구역. 빈 문자열이면 전국 공식전 */
  area?: string;
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
  // 처음 온 사람에게는 이용 안내를 덮어서 먼저 보여준다 (그동안 제한 시간은 멈춘다)
  const guide = useGuide("findreal");
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CheckResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [combo, setCombo] = useState<ComboState>({ current: 0, best: 0 });
  const [busy, setBusy] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");
  const [eImgState, setEImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");
  const [xpRes, setXpRes] = useState<XpResult | null>(null);
  const [eXpRes, setEXpRes] = useState<XpResult | null>(null);

  // 무한 라운드 (콤보는 데일리·무한 공통으로 이어진다)
  const [endless, setEndless] = useState(false);
  const [eOptions, setEOptions] = useState<string[] | null>(null);
  const [eCount, setECount] = useState(0);
  const [sHits, setSHits] = useState(0);
  const [sMaxCombo, setSMaxCombo] = useState(0); // 판에서 도달한 최고 연속
  const [officialDone, setOfficialDone] = useState(false); // 오늘 공식전 출전 여부
  const [dTop, setDTop] = useState<number | null>(null); // 공식전 순위 (그날 그 구역 그 창구)
  const [pendingOfficial, setPendingOfficial] = useState(false); // 홈에서 공식전으로 바로 들어왔는가
  const [eTop, setETop] = useState<number | null>(null); // 이 판의 최근 7일 상위 %
  const [area, setArea] = useState(""); // 담당 구역 (빈 값이면 서울 전체)
  const sessionTimes = useRef<number[]>([]);
  const startBest = useRef(0);
  const qStart = useRef(0);
  // 문제마다 쌓는 점수 (lib/scoring.ts). 이탈 경로에서도 읽어야 해 ref로 둔다
  const officialPts = useRef(0);
  const endlessPts = useRef(0);

  useEffect(() => {
    setCombo(comboState());
    setArea(areaPref().replace(/특별자치시$|특별시$|광역시$/, ""));
    // 홈 대장의 공식전 칸에서 바로 들어온 경우(?official=1)는 곧장 공식전을 연다.
    // quiz가 들어온 뒤에 열어야 해서 깃발만 세우고 아래 effect에서 처리한다
    const wantOfficial = new URLSearchParams(window.location.search).get("official") === "1";
    const officialArea = areaPref();
    fetch(`/api/findreal/today${officialArea ? `?area=${encodeURIComponent(officialArea)}` : ""}`)
      .then((r) => r.json())
      .then((data: TodayResponse) => {
        setQuiz(data);
        // 무한이 본편 — 공식전(오늘의 10문제)은 선택 참가
        try {
          const saved = JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null") as {
            date: string;
            marks: boolean[];
          } | null;
          setOfficialDone(Boolean(saved && saved.date === data.date && saved.marks.length === data.items.length));
        } catch {
          /* 무시 */
        }
        if (wantOfficial) setPendingOfficial(true);
        else void startEndless();
      })
      .catch(() => setPhase("error"));
  }, []);

  // 공식전 직행: quiz가 도착한 뒤에 연다. 이미 치렀으면 성적표를 펼친다
  useEffect(() => {
    if (!pendingOfficial || !quiz) return;
    setPendingOfficial(false);
    if (officialDone) replayOfficial();
    else startOfficial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOfficial, quiz, officialDone]);

  useEffect(() => {
    if (phase === "solve") qStart.current = Date.now();
  }, [phase, idx, eCount]);

  const options = endless ? eOptions : quiz?.items[idx]?.options;
  const roundNo = endless ? null : quiz?.items[idx]?.no;
  const total = quiz?.items.length ?? 10;

  async function fetchEndless() {
    const a = areaPref();
    const res = await fetch(`/api/endless/find${a ? `?area=${encodeURIComponent(a)}` : ""}`);
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
      endlessPts.current = 0;
      setEImgState("idle");
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
              option === null
                ? { date: quiz!.date, no: roundNo, timeout: true, area: quiz!.area ?? "" }
                : { date: quiz!.date, no: roundNo, pick: option, area: quiz!.area ?? "" },
            ),
          });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setPicked(option);
      setReveal(data);
      setTimedOut(option === null);
      if (!endless) {
        setMarks((m) => [...m, data.correct]);
        officialPts.current += questionScore("findreal", { correct: data.correct, elapsedMs: dt });
      } else {
        setECount((c) => c + 1);
        sessionTimes.current.push(dt);
        if (data.correct) {
          setSHits((h) => h + 1);
          endlessPts.current += questionScore("findreal", {
            correct: true,
            elapsedMs: dt,
            run: combo.current + 1,
            endless: true,
          });
        }
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
    setOfficialDone(true);
    setXpRes(addXp(officialPts.current + FINISH_BONUS, quiz?.area ?? ""));
    setPhase("done");
    // 공식전 완주 접수: 그날 그 구역 찾기 참가자끼리의 순위
    setDTop(null);
    const score = marks.filter(Boolean).length;
    void fetch("/api/findreal/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: quiz.date, score, area: quiz.area ?? "" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { top: number | null } | null) => {
        setDTop(d?.top ?? null);
        try {
          localStorage.setItem(RESULT_KEY, JSON.stringify({ date: quiz.date, marks, topPct: d?.top ?? null, area: quiz.area ?? "" }));
        } catch {
          /* 무시 */
        }
      })
      .catch(() => undefined);
  }

  const hits = marks.filter(Boolean).length;
  const runAvg = combo.runCount ? fmtSec((combo.runTotalMs ?? 0) / combo.runCount) : null;
  const sessionAvgMs = () =>
    sessionTimes.current.length
      ? Math.round(sessionTimes.current.reduce((a, b) => a + b, 0) / sessionTimes.current.length)
      : null;

  /** 이번 판을 집계에 접수한다 (화면 전환 없음). keepalive는 이탈 중에도 요청을 살린다 */
  function submitEndlessRun(keepalive = false): Promise<number | null> {
    return fetch("/api/endless/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "findreal", best: sMaxCombo, hits: sHits, count: eCount, avgMs: sessionAvgMs() }),
      keepalive,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { top: number | null } | null) => d?.top ?? null)
      .catch(() => null);
  }

  const runXp = () => endlessPts.current + (sMaxCombo > startBest.current ? RECORD_BONUS : 0);

  function finishEndless() {
    if (sMaxCombo > startBest.current) sfxRecord();
    else sfxResult();
    setEXpRes(addXp(runXp(), areaPref()));
    setPhase("eresult");
    setETop(null);
    void submitEndlessRun().then(setETop);
  }

  /** 결과를 안 보고 떠나도 쌓은 것은 남긴다 */
  function abandonEndless(keepalive = false) {
    if (!endless || eCount === 0) return;
    addXp(runXp(), areaPref());
    void submitEndlessRun(keepalive);
  }

  /** 공식전(오늘의 10문제) 참가 */
  function startOfficial() {
    sfxTap();
    abandonEndless(); // 공식전으로 갈아타도 여태 쌓은 판은 접수하고 간다
    setEndless(false);
    setIdx(0);
    setMarks([]);
    officialPts.current = 0;
    setPicked(null);
    setReveal(null);
    setPhase("solve");
  }

  /** 오늘 이미 치른 공식전 성적표 다시 열기 */
  function replayOfficial() {
    if (!quiz) return;
    try {
      const saved = JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null") as {
        date: string;
        marks: boolean[];
        topPct?: number | null;
      } | null;
      if (!saved || saved.date !== quiz.date) return;
      sfxTap();
      setEndless(false);
      setMarks(saved.marks);
      setDTop(saved.topPct ?? null);
      setXpRes(null); // 경험치는 이미 받았다
      setImgState("idle");
      setPhase("done");
    } catch {
      /* 저장본을 못 읽으면 아무 일도 하지 않는다 */
    }
  }

  const dGrade = findGradeFor(hits);
  const eGradeName =
    sMaxCombo > startBest.current ? "신기록 갱신" : sMaxCombo >= 5 ? "매의 눈" : "감정 수련";

  /** 공유 카드 내용. 통지서(이미지)와 링크 공유가 같은 값을 쓴다 */
  const officialCard = (): ShareCardData => ({
      episode: quiz?.episode ?? 0,
      date: quiz?.date ?? "",
      subtitle: "진짜 찾기 감정 통지서",
      score: hits,
      total,
      marks,
      gradeName: dGrade.name,
      stats: [
        { value: `${combo.current}`, label: "이어지는 연속", accent: combo.current > 0 },
        { value: `${combo.best}`, label: "역대 최고 연속" },
        { value: `${total - hits}번`, label: "AI에 속은 횟수" },
        { value: fmtSec(combo.bestAvgMs) ?? "-", label: "최고 기록 평균 판단" },
      ],
  });

  async function shareImage() {
    if (!quiz || imgState === "busy") return;
    sfxTap();
    setImgState("busy");
    try {
      const result = await shareCardImage(officialCard());
      setImgState(result);
    } catch {
      setImgState("failed");
    }
  }

  const ep = quiz?.episode ?? "";
  /** 공식전 이름 — 구역별 공식전이면 구역을 함께 밝힌다 (제3호 부산 공식전) */
  const officialArea = (quiz?.area ?? "").replace(/특별자치시$|특별시$|광역시$/, "");
  const officialName = officialArea ? `제${ep}호 ${officialArea} 공식전` : `제${ep}호 공식전`;
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");

  /** 공유 카드 내용. 통지서(이미지)와 링크 공유가 같은 값을 쓴다 */
  const endlessCard = (): ShareCardData => ({
      episode: quiz?.episode ?? 0,
      date: quiz?.date ?? "",
      subtitle: "무한 진짜 찾기 통지서",
      headerRight: `무한 감정 · ${mm}.${dd}`,
      score: sMaxCombo,
      total: eCount,
      totalText: "연속",
      marks: [], // 무한은 문제 수가 열려 있어 10칸 그리드로 못 담는다
      gradeName: eGradeName,
      stats: [
        { value: `${sHits}/${eCount}`, label: "이번 판 적중" },
        { value: fmtSec(sessionAvgMs()) ?? "-", label: "평균 판단 시간" },
        { value: `${Math.max(combo.best, sMaxCombo)}`, label: "역대 최고 연속", accent: sMaxCombo > startBest.current },
        eTop !== null
          ? { value: `상위 ${eTop}%`, label: "최근 7일 판 순위", accent: true }
          : { value: `+${eXpRes?.gained ?? 0}점`, label: "획득 경험치" },
      ],
  });

  async function shareEndlessImage() {
    if (!quiz || eImgState === "busy") return;
    sfxTap();
    setEImgState("busy");
    try {
      const result = await shareCardImage(endlessCard());
      setEImgState(result);
    } catch {
      setEImgState("failed");
    }
  }

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
          나머지 셋은 AI 작품입니다. 오판하면 연속이 끊기고, 연속은 내일로 이어집니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/" onClick={() => abandonEndless(true)}>
            아파트 감별사
            <small>
              {endless ? (area ? `무한 찾기 · ${area}` : "무한 찾기") : officialName}
              {quiz && (endless ? ` · 제${ep}호 ${mm}.${dd}` : ` · ${mm}.${dd}`)}
            </small>
          </Link>
          <span className="head-tools">
            <RuleButton onOpen={() => guide.setOpen(true)} />
            <SoundToggle />
            {/* 결과·성적표 화면에는 "창구로 돌아가기" 버튼이 이미 있다.
                같은 일을 하는 X를 헤더에 또 두면 나가는 문이 둘로 보인다 */}
            {(phase === "solve" || phase === "reveal") && (
            <CloseX
              inProgress={!endless && (phase === "solve" || phase === "reveal")}
              onClose={endless && (phase === "solve" || phase === "reveal") && eCount > 0 ? finishEndless : undefined}
            />
            )}
            </span>
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
            {endless ? (
              <p className="qlabel mono qlabel-row">
                <span className="mode-chip">무한</span>
                {eCount + (phase === "solve" ? 1 : 0)}번째 · 연속 {combo.current} · 최고 {combo.best}
              </p>
            ) : (
              <p className="qlabel mono qlabel-row">
                <span className="mode-chip official">{officialName}</span>
                {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </p>
            )}

            <TimerBar
              seconds={TIME_LIMIT}
              active={phase === "solve" && !guide.open}
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
                      연속이 끊겼습니다 · 최고 {combo.best}
                      {fmtSec(combo.bestAvgMs) ? ` (평균 ${fmtSec(combo.bestAvgMs)})` : ""}
                    </>
                  )}
                </p>
                <div className="choices">
                  <button className="btn btn-next full" onClick={next} disabled={busy}>
                    {!endless && idx + 1 === total ? "결과 보기" : "다음 문제"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {phase === "eresult" && (
          <section className="screen result">
            <div className="result-seal" aria-hidden="true">
              <Seal size={216} />
            </div>
            <DocTitle eyebrow="감정결과통지" title="무한 찾기 결과" />
            <StampHero name={eGradeName} />
            <p className="stamp-sub">
              {eCount}문제 중 {sHits}문제 적중 · 최고 연속 {sMaxCombo}
            </p>
            <VForm>
              <VRow label="이번 판">
                연속 {sMaxCombo} <small>평균 {fmtSec(sessionAvgMs()) ?? "-"}</small>
              </VRow>
              <VRow label="역대 최고">
                {Math.max(combo.best, sMaxCombo)}
                {sMaxCombo > startBest.current && <span className="accent">신기록</span>}
              </VRow>
              <VRow label="판 순위">
                {eTop !== null ? (
                  <>
                    상위 <span className="accent">{eTop}%</span> <small>최근 7일</small>
                  </>
                ) : (
                  <>
                    집계 중 <small>표본 20판부터 공개</small>
                  </>
                )}
              </VRow>
              <VRow label="직급">
                <LevelBar result={eXpRes} />
              </VRow>
            </VForm>
            <div className="cut" />
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
                        : "통지서 공유"}
              </button>
              <ShareLink data={endlessCard()} />
            </div>
            {/* 아래 줄은 이 판을 끝낸 다음에 할 일이다. 공유 두 갈래와
                섞어 놓으면 네 단추가 다 같은 무게로 보인다 */}
            <div className="result-actions">
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
              <Seal size={216} />
            </div>
            <DocTitle eyebrow="감정결과통지" title={`제${ep}호 감정 결과`} />
            <StampHero name={dGrade.name} />
            <p className="stamp-sub">
              {total}문제 중 {hits}문제 적중 · AI에 {total - hits}번 속았습니다
            </p>
            <VForm>
              <VRow label="판정">
                <MiniGrid marks={marks} label={`${total}문제 중 ${hits}문제 적중`} />
              </VRow>
              <VRow label="이어지는 연속">
                {combo.current}
                {runAvg && <small>평균 {runAvg}</small>}
              </VRow>
              <VRow label="역대 최고">
                {combo.best}
                {fmtSec(combo.bestAvgMs) && <small>평균 {fmtSec(combo.bestAvgMs)}</small>}
              </VRow>
              <VRow label={officialArea ? `${officialArea} 순위` : "전국 순위"}>
                {dTop !== null ? (
                  <>
                    상위 <span className="accent">{dTop}%</span>{" "}
                    <small>{officialArea ? `${officialArea} 참가자 기준` : "전국 참가자 기준"}</small>
                  </>
                ) : (
                  <>
                    집계 중 <small>표본 100명부터 공개</small>
                  </>
                )}
              </VRow>
              <VRow label="직급">
                <LevelBar result={xpRes} />
              </VRow>
            </VForm>
            <div className="cut" />
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
                        : "통지서 공유"}
              </button>
              <ShareLink data={officialCard()} />
            </div>
            {/* 아래 줄은 이 판을 끝낸 다음에 할 일이다. 공유 두 갈래와
                섞어 놓으면 네 단추가 다 같은 무게로 보인다 */}
            <div className="result-actions">
              <button className="btn btn-ghost" onClick={startEndless} disabled={busy}>
                무한 계속
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        <SheetFooter />
        {guide.open && (
          <RuleOverlay game="findreal" official={!endless} first={guide.auto} onClose={() => guide.setOpen(false)} />
        )}
      </main>
    </div>
  );
}
