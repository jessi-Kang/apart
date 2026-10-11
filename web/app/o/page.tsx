"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LevelBar } from "@/components/LevelBar";
import { DocTitle, MiniGrid, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { CloseX } from "@/components/CloseX";
import { SoundToggle } from "@/components/SoundToggle";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { RuleButton, RuleOverlay, useGuide } from "@/components/RuleNote";
import { TimerBar } from "@/components/TimerBar";
import { AptPhoto, photoEnabled } from "@/components/AptPhoto";
import { gradeFor } from "@/lib/grades";
import { areaPref, bumpStreak, bumpEndlessRecord, comboState, endlessRecord, loadResult, saveResult, type EndlessRecord, type ReviewItem, type SavedResult } from "@/lib/local";
import { addXp, type XpResult } from "@/lib/level";
import { FINISH_BONUS, RECORD_BONUS, questionScore } from "@/lib/scoring";
import { shareCardImage, shareLink, type ShareCardData } from "@/lib/sharecard";
import { ShareLink } from "@/components/ShareLink";
import { sfxRecord, sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";

interface TodayResponse {
  date: string;
  episode: number;
  /** 서버가 실제로 적용한 구역. 빈 문자열이면 전국 공식전 */
  area?: string;
  items: { no: number; name: string }[];
}

interface AnswerResponse {
  correct: boolean;
  kind: "real" | "fake";
  meta?: { location: string; builtYear: number; households: number; geo?: [number, number] | [number, number, number] };
  hint?: string;
  rate?: number | null;
  sample?: number;
  /** 도전 판이 이 답으로 끝났다 */
  over?: { mine: number; target: number };
}

/** 받은 도전장 (겉면만. 시드는 서버에만 있다) */
interface Chal {
  code: string;
  target: number;
  label: string;
}

/** 도전 판의 끝. at은 끊긴 문제 번호(그만두었으면 null) */
interface Over {
  mine: number;
  target: number;
  at: number | null;
  name: string | null;
  kind: "real" | "fake" | null;
}

type Phase = "loading" | "question" | "reveal" | "result" | "eresult" | "cresult" | "error";

const TIME_LIMIT = 12; // 초 — 이름 보고 직감으로 찍는 게임이라 짧게

const fmtSec = (ms: number | null | undefined) =>
  ms == null ? null : `${(ms / 1000).toFixed(1)}초`;

export default function PlayPage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  // 처음 온 사람에게는 이용 안내를 덮어서 먼저 보여준다 (그동안 제한 시간은 멈춘다)
  const guide = useGuide("ox");
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
  // 도전장: 받은 것(chal)과 그 판의 끝(over), 보내기 단추 상태
  const [chal, setChal] = useState<Chal | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  /** 답을 이미 아는 도전 판(다시 치기·내 도전장). 서버가 정해 준다 — 경험치도 도전장 발송도 없다 */
  const [retry, setRetry] = useState(false);
  /** 이 문제의 사진을 못 받았다. 사진 칸을 접는다 */
  const [photoFail, setPhotoFail] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "busy" | "shared" | "copied" | "failed">("idle");
  const [xpRes, setXpRes] = useState<XpResult | null>(null); // 이번 완주 획득 점수
  const [eXpRes, setEXpRes] = useState<XpResult | null>(null); // 무한 판 획득 점수

  // 무한 감별 (데일리 완주 후 랜덤 새 문제 연속 — 집계 미반영)
  const [endless, setEndless] = useState(false);
  const [eq, setEq] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [eCount, setECount] = useState(0);
  const [eRec, setERec] = useState<EndlessRecord>({ best: 0, avgMs: null });
  const [sHits, setSHits] = useState(0); // 이번 판 적중 수
  const [sBest, setSBest] = useState(0); // 이번 판 최고 연속
  const [eTop, setETop] = useState<number | null>(null); // 이 판의 최근 7일 상위 %
  const [area, setArea] = useState(""); // 담당 구역 (빈 값이면 서울 전체)
  const qStart = useRef(0);
  const runTimes = useRef<number[]>([]); // 현재 연속 구간의 문제별 풀이 시간(ms)
  const sessionTimes = useRef<number[]>([]); // 이번 판 전체 풀이 시간(ms)
  const startBest = useRef(0); // 판 시작 시점의 역대 최고 (신기록 판정용)
  // 문제마다 쌓는 점수. 빨리 맞힐수록 커진다 (lib/scoring.ts).
  // 결과를 안 보고 떠나는 경로에서도 읽어야 해서 ref로 둔다
  const officialPts = useRef(0);
  const endlessPts = useRef(0);

  useEffect(() => {
    setERec(endlessRecord("ox"));
    setArea(areaPref().replace(/특별자치시$|특별시$|광역시$/, ""));
    // 홈 대장의 현황 칸에서 바로 들어온 경우(?official=1)는 곧장 공식전을 연다
    const params = new URLSearchParams(window.location.search);
    const wantOfficial = params.get("official") === "1";
    // 도전장 링크(/c/번호)에서 "도전 접수"로 들어온 경우
    const chalCode = params.get("c");
    // 공식전도 구역을 따른다. 같은 (날짜, 구역)이면 누구나 같은 10문제다
    const officialArea = areaPref();
    fetch(`/api/quiz/today${officialArea ? `?area=${encodeURIComponent(officialArea)}` : ""}`)
      .then((r) => r.json())
      .then((data: TodayResponse) => {
        setQuiz(data);
        // 무한이 본편 — 창구에 들어오면 바로 시작한다. 공식전(오늘의 10문제)은 선택 참가
        const saved = loadResult(data.date);
        const done = Boolean(saved && saved.marks.length === data.items.length);
        if (chalCode) {
          void openChallenge(chalCode);
        } else if (wantOfficial && done && saved) {
          openSavedOfficial(data.date, saved);
        } else if (wantOfficial) {
          startOfficial();
        } else {
          void startEndless();
        }
      })
      .catch(() => setPhase("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "question") qStart.current = Date.now();
  }, [phase, idx, eCount]);

  /** start면 새 판을 연다(code가 있으면 그 도전장의 판). 아니면 지금 판의 다음 문제.
   * 판의 진행과 기록은 서버가 센다 (lib/oxrun.ts) */
  async function fetchEndless(start = false, code?: string) {
    const q = new URLSearchParams();
    if (start) {
      q.set("start", "1");
      const a = areaPref();
      if (code) q.set("c", code);
      else if (a) q.set("area", a);
    }
    const qs = q.toString();
    const res = await fetch(`/api/endless/ox${qs ? `?${qs}` : ""}`);
    if (!res.ok) throw new Error("endless_failed");
    const d = (await res.json()) as { name: string; practice?: boolean };
    setEq(d.name);
    if (start) setRetry(Boolean(d.practice));
  }

  async function openChallenge(code: string) {
    try {
      const res = await fetch(`/api/challenge/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("challenge_failed");
      const c = (await res.json()) as Chal;
      await startEndless(c);
    } catch {
      setPhase("error");
    }
  }

  async function startEndless(c: Chal | null = null) {
    sfxTap();
    setBusy(true);
    try {
      await fetchEndless(true, c?.code);
      setChal(c);
      setOver(null);
      // 도전장 판을 떠나 내 판을 열었으면 주소의 ?c=도 걷는다. 새로고침이 도전장으로 돌아가지 않게
      if (!c && window.location.search.includes("c=")) window.history.replaceState(null, "", "/o");
      setSendState("idle");
      setEndless(true);
      setRun(0);
      setECount(0);
      setSHits(0);
      setSBest(0);
      endlessPts.current = 0;
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

  /** 이번 판을 집계에 접수한다. 화면을 바꾸지 않으므로 이탈 경로에서도 쓴다.
   * keepalive: 페이지를 떠나는 중에도 요청이 살아남게 한다 */
  function submitEndlessRun(keepalive = false): Promise<number | null> {
    return fetch("/api/endless/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ox", best: sBest, hits: sHits, count: eCount, avgMs: sessionAvgMs() }),
      keepalive,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { top: number | null } | null) => d?.top ?? null)
      .catch(() => null);
  }

  /** 이번 판에 쌓은 문제 점수 + 신기록 보너스 */
  const runXp = () => (retry ? 0 : endlessPts.current + (sBest > startBest.current ? RECORD_BONUS : 0));

  function finishEndless() {
    if (sBest > startBest.current) sfxRecord();
    else sfxResult();
    setEXpRes(addXp(runXp(), areaPref()));
    setPhase("eresult");
    // 판 기록 접수: 최근 7일 다른 판들과 비교한 상위 % (익명 집계)
    setETop(null);
    void submitEndlessRun().then(setETop);
  }

  /** 결과를 안 보고 떠나는 경우에도 쌓은 것은 남긴다 — 나가면 손해인 구조는 만들지 않는다 */
  function abandonEndless(keepalive = false) {
    if (!endless || eCount === 0 || phase === "cresult") return;
    addXp(runXp(), areaPref());
    // 도전 판은 보낸 사람의 구간에서 시작하므로 무한 판 순위에 섞지 않는다
    if (!chal) void submitEndlessRun(keepalive);
  }

  /** 공식전(오늘의 10문제) 참가 — 전국 동일 문제, 정답률·상위% 집계 */
  function startOfficial() {
    sfxTap();
    abandonEndless(); // 공식전으로 갈아타도 여태 쌓은 판은 접수하고 간다
    setEndless(false);
    setIdx(0);
    setMarks([]);
    setReview([]);
    officialPts.current = 0;
    setReveal(null);
    setPhase("question");
  }

  /** 저장된 공식전 성적표를 화면에 올린다. quiz 상태가 아직 없는 마운트 시점에도 쓴다 */
  function openSavedOfficial(date: string, saved: SavedResult) {
    setEndless(false);
    setMarks(saved.marks);
    setReview(saved.review ?? []);
    setTopPct(saved.topPct ?? null);
    setStreak(bumpStreak(date)); // 같은 날 재호출은 기존 값을 그대로 돌려준다
    setXpRes(null); // 경험치는 이미 받았다 — 다시 주지 않는다
    setImgState("idle");
    setPhase("result");
  }


  async function answer(choice: "real" | "fake" | "timeout") {
    if (busy || phase !== "question") return;
    setBusy(true);
    if (choice !== "timeout") sfxTap();
    const dt = Date.now() - qStart.current;
    try {
      setPhotoFail(false);
      if (endless) {
        if (!eq) throw new Error("no_question");
        const res = await fetch("/api/endless/ox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: eq, choice }),
        });
        if (!res.ok) throw new Error("answer_failed");
        const data = (await res.json()) as AnswerResponse;
        if (data.over) setOver({ ...data.over, at: eCount + 1, name: eq, kind: data.kind });
        setReveal(data);
        setTimedOut(choice === "timeout");
        setECount((c) => c + 1);
        sessionTimes.current.push(dt);
        if (data.correct) {
          runTimes.current.push(dt);
          const nextRun = run + 1;
          endlessPts.current += questionScore("ox", { correct: true, elapsedMs: dt, run: nextRun, endless: true });
          setRun(nextRun);
          setSHits((h) => h + 1);
          setSBest((b) => Math.max(b, nextRun));
          if (!retry) setERec(bumpEndlessRecord("ox", nextRun, runAvgMs()));
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
        body: JSON.stringify({ date: quiz.date, no: item.no, choice, area: quiz.area ?? "" }),
      });
      if (!res.ok) throw new Error("answer_failed");
      const data = (await res.json()) as AnswerResponse;
      setReveal(data);
      setTimedOut(choice === "timeout");
      setMarks((m) => [...m, data.correct]);
      officialPts.current += questionScore("ox", { correct: data.correct, elapsedMs: dt });
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
    if (endless && over) {
      finishChallenge();
      return;
    }
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
    setXpRes(addXp(officialPts.current + FINISH_BONUS, quiz.area ?? "")); // 문제 점수 + 완주 보너스
    setPhase("result");
    try {
      const res = await fetch("/api/quiz/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: quiz.date, score, area: quiz.area ?? "" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { top: number | null };
        setTopPct(data.top);
        // 순위까지 저장해 둬야 성적표를 다시 열었을 때 "집계 중"으로 퇴보하지 않는다
        saveResult({ date: quiz.date, marks, review, topPct: data.top, area: quiz.area ?? "" });
      }
    } catch {
      /* 집계 실패는 결과 표시에 영향 없음 */
    }
  }

  const score = marks.filter(Boolean).length;
  const grade = useMemo(() => gradeFor(score), [score]);
  const eRate = eCount > 0 ? sHits / eCount : 0;
  const eGradeName =
    sBest > startBest.current ? "신기록 갱신" : eRate >= 0.8 ? "상급 감별" : eRate >= 0.5 ? "감별 수련" : "재수련 요망";

  /** 공유 카드 내용. 통지서(이미지)와 링크 공유가 같은 값을 쓴다 */
  const officialCard = (): ShareCardData => ({
      episode: quiz?.episode ?? 0,
      date: quiz?.date ?? "",
      subtitle: "감별 결과 통지서",
      score,
      total: 10,
      marks,
      gradeName: grade.name,
      stats: [
        {
          value: topPct !== null ? `상위 ${topPct}%` : "집계 중",
          label: officialArea ? `${officialArea} 순위` : "전국 순위",
          accent: topPct !== null,
        },
        { value: `${eRec.best}`, label: "무한 최고 연속" },
        { value: `${10 - score}번`, label: "AI에 속은 횟수" },
        { value: `${comboState().best}`, label: "진짜 찾기 최고 연속" },
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

  /** 공식전 이름 — 구역별 공식전이면 구역을 함께 밝힌다 (부산 공식전) */
  const officialArea = (quiz?.area ?? "").replace(/특별자치시$|특별시$|광역시$/, "");
  const officialName = officialArea ? `${officialArea} 공식전` : "공식전";
  const [, mm, dd] = (quiz?.date ?? "--------").split("-");
  const currentName = endless ? eq : quiz?.items[idx]?.name;

  /** 도전 판을 끝내고 대결 통지서를 연다 */
  function finishChallenge() {
    if (over && over.mine > over.target) sfxRecord();
    else sfxResult();
    setEXpRes(addXp(runXp(), areaPref()));
    setPhase("cresult");
  }

  /** 도전 중에 그만둔다. 그때까지의 연속이 내 기록이 된다 (넘긴 채 멈추는 경우) */
  async function quitChallenge() {
    setBusy(true);
    try {
      const res = await fetch("/api/endless/ox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: true }),
      });
      const d = res.ok ? ((await res.json()) as { over: { mine: number; target: number } }) : null;
      const o: Over = { mine: d?.over.mine ?? sBest, target: d?.over.target ?? chal?.target ?? 0, at: null, name: null, kind: null };
      setOver(o);
      if (o.mine > o.target) sfxRecord();
      else sfxResult();
      setEXpRes(addXp(runXp(), areaPref()));
      setPhase("cresult");
    } finally {
      setBusy(false);
    }
  }

  /** 도전장 보내기. 기록은 서버가 센 이 판의 것이 실린다 */
  async function sendChallenge() {
    if (sendState === "busy") return;
    sfxTap();
    setSendState("busy");
    try {
      const res = await fetch("/api/challenge", { method: "POST" });
      if (!res.ok) throw new Error("challenge_failed");
      const { code, target } = (await res.json()) as { code: string; target: number };
      const url = `${window.location.origin}/c/${code}`;
      setSendState(await shareLink(`[아파트 감별사] 도전장\n나는 ${target}문제를 연속으로 맞혔다. 넘어 볼래?\n${url}`));
    } catch {
      setSendState("failed");
    }
  }

  const sendLabel = (idle: string) =>
    sendState === "busy"
      ? "보내는 중"
      : sendState === "shared"
        ? "보냈습니다"
        : sendState === "copied"
          ? "링크 복사됨"
          : sendState === "failed"
            ? "다시 시도"
            : idle;

  const outcome = over ? (over.mine > over.target ? "승리" : over.mine === over.target ? "무승부" : "패배") : "";

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          이름만 보고
          <br />
          판단하십시오.
          <br />
          {/* 붙여 쓰는 두 어절이라 사이에 NBSP — "검색은 / 반칙"으로 쪼개지면 문장이 죽는다 */}
          <em>검색은{" "}반칙</em>
        </h2>
        <p className="note">
          정답마다 실제 위치와 준공년도가 공개되고, 판을 끝내면 통지서가 발급됩니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/" onClick={() => abandonEndless(true)}>
            아파트 감별사
            <small>
              {chal ? `도전장 · ${chal.label || "익명"}` : endless ? (area ? `무한 감별 · ${area}` : "무한 감별") : officialName}
                          </small>
          </Link>
          <span className="head-tools">
            <RuleButton onOpen={() => guide.setOpen(true)} />
            <SoundToggle />
            {/* 결과·성적표 화면에는 "창구로 돌아가기" 버튼이 이미 있다.
                같은 일을 하는 X를 헤더에 또 두면 나가는 문이 둘로 보인다 */}
            {(phase === "question" || phase === "reveal") && (
            <CloseX
              inProgress={!endless && (phase === "question" || phase === "reveal") && marks.length < 10}
              onClose={
                endless && eCount > 0
                  ? chal
                    ? over
                      ? finishChallenge
                      : () => void quitChallenge()
                    : finishEndless
                  : undefined
              }
            />
            )}
            </span>
        </header>

        {phase === "loading" && (
          <section className="screen">
            <p className="center-note">문제를 준비하고 있습니다</p>
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
            {chal ? (
              <>
                {/* 상대 기록까지 얼마나 남았는지. 설명은 얹지 않고 막대 하나만 더한다 */}
                <div className="rival" aria-label={`상대 기록 ${chal.target} 중 ${run}`}>
                  <i style={{ width: `${Math.min(100, (run / Math.max(1, chal.target)) * 100)}%` }} />
                </div>
                <p className="qlabel mono qlabel-row">
                  <span className="mode-chip official">도전장</span>
                  {eCount + (phase === "question" ? 1 : 0)}번째 · 연속 정답 {run} / 상대 {chal.target}
                </p>
              </>
            ) : endless ? (
              <p className="qlabel mono qlabel-row">
                <span className="mode-chip">무한</span>
                {eCount + (phase === "question" ? 1 : 0)}번째 · 연속 {run} · 최고 {eRec.best}
              </p>
            ) : (
              <>
                <div className="progress" aria-hidden="true">
                  {quiz!.items.map((_, k) => (
                    <i key={k} className={k < idx ? "done" : k === idx ? "now" : ""} />
                  ))}
                </div>
                <p className="qlabel mono qlabel-row">
                  <span className="mode-chip official">{officialName}</span>
                  {String(idx + 1).padStart(2, "0")} / 10
                </p>
              </>
            )}
            <p className="task-line">이 단지, <b>진짜</b>일까 <b>가짜</b>일까?</p>
            <div className="qname-wrap paper-in" key={`${endless ? "e" : "d"}-${endless ? eCount : idx}`}>
              <h2 className="qname">{currentName}</h2>
            </div>

            <TimerBar
              seconds={TIME_LIMIT}
              active={phase === "question" && !guide.open}
              resetKey={endless ? `e${eCount}` : idx}
              onExpire={() => answer("timeout")}
            />

            {phase === "reveal" && reveal && (
              <div className={`verdict ${reveal.correct ? "right" : "wrong"}`}>
                {/* 진짜이고 사진이 있으면 칸 오른쪽 위에 작은 사진(확정 시안 photo-a 1번). 사진 폭은
                    좁은 화면에서 56px로 줄여 제목이 한 줄로 들어가게 한다 */}
                <div className={reveal.kind === "real" && photoEnabled(reveal.meta?.geo) && !photoFail ? "with-thumb" : undefined}>
                  <div className="verdict-txt">
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
                  </div>
                  {reveal.kind === "real" && reveal.meta?.geo && photoEnabled(reveal.meta.geo) && !photoFail && currentName && (
                    <AptPhoto
                      key={currentName}
                      geo={reveal.meta.geo}
                      name={currentName}
                      caption={`${reveal.meta.location} · ${reveal.meta.builtYear}년 준공 · ${reveal.meta.households.toLocaleString()}세대`}
                      onLoadFail={() => setPhotoFail(true)}
                    />
                  )}
                </div>
                <p className="rate">
                  {chal
                    ? reveal.correct
                      ? run > chal.target
                        ? `${run}문제 연속 정답 · 상대를 넘었습니다`
                        : `${run}문제 연속 정답 · ${chal.target - run + 1}문제 더 맞히면 승리`
                      : "여기서 끝났습니다"
                    : endless
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
                  {(!endless && idx + 1 === quiz!.items.length) || (endless && over) ? "결과 보기" : "다음 문제"}
                </button>
              </div>
            )}
          </section>
        )}

        {phase === "eresult" && (
          <section className="screen result">
            <div className="result-seal" aria-hidden="true">
              <Seal size={216} />
            </div>
            <DocTitle eyebrow="감별결과통지" title="무한 감별 결과" />
            <StampHero name={eGradeName} />
            <p className="stamp-sub">
              {eCount}문제 중 {sHits}문제 적중 · 최고 연속 {sBest}
            </p>
            <VForm>
              <VRow label="이번 판">
                연속 {sBest} <small>평균 {fmtSec(sessionAvgMs()) ?? "-"}</small>
              </VRow>
              <VRow label="역대 기록">
                {Math.max(eRec.best, sBest)}
                {sBest > startBest.current && <span className="accent">신기록</span>}
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
            {/* 통지서 공유 자리를 도전장이 이어받는다. 날짜가 아니라 사람이 다시 불러들이게 한다 */}
            <div className="result-actions">
              <button className="btn btn-next full" onClick={sendChallenge} disabled={sendState === "busy" || sBest < 1}>
                {sendLabel("도전장 보내기")}
              </button>
            </div>
            <p className="send-hint">
              {sBest < 1 ? "한 문제라도 맞혀야 도전장을 보낼 수 있습니다" : `${sBest}문제 연속으로 맞힌 그 문제들이 같은 순서로 나갑니다`}
            </p>
            <div className="result-actions">
              <button className="btn btn-ghost" onClick={() => startEndless()} disabled={busy}>
                한 판 더
              </button>
              <Link className="btn btn-ghost" href="/">
                창구로 돌아가기
              </Link>
            </div>
          </section>
        )}

        {phase === "cresult" && chal && over && (
          <section className="screen result">
            <DocTitle eyebrow="대결통지" title={`${chal.label ? `${chal.label} 님의` : "받은"} 도전장`} />
            <StampHero name={outcome} />
            <p className="stamp-sub">
              {outcome === "승리"
                ? `상대는 ${over.target}문제, 나는 ${over.mine}문제를 연속으로 맞혔습니다`
                : outcome === "무승부"
                  ? `둘 다 ${over.mine}문제를 연속으로 맞혔습니다`
                  : `상대는 ${over.target}문제를 연속으로 맞혔는데, 나는 ${
                      over.mine === 0
                        ? "첫 문제에서 틀렸습니다"
                        : over.at
                          ? `${over.mine}문제를 맞히고 ${over.mine + 1}번째에서 틀렸습니다`
                          : `${over.mine}문제를 맞히고 멈췄습니다`
                    }`}
            </p>
            {retry && <p className="send-hint">답을 본 판이라 기록과 경험치에 들어가지 않습니다</p>}
            <VForm>
              <VRow label="나">{over.mine}문제 연속 정답</VRow>
              <VRow label="상대">{over.target}문제 연속 정답</VRow>
              {over.at && over.name && (
                <VRow label="틀린 문제">
                  {over.name} <small>{over.kind === "real" ? "진짜 아파트" : "AI가 지은 이름"}</small>
                </VRow>
              )}
              <VRow label="직급">
                <LevelBar result={eXpRes} />
              </VRow>
            </VForm>
            <div className="cut" />
            {outcome === "패배" || retry ? (
              <>
                <div className="result-actions">
                  <button className="btn btn-next full" onClick={() => startEndless()} disabled={busy}>
                    새 판 치기
                  </button>
                </div>
                <p className="send-hint">새 판의 기록으로 도전장을 보낼 수 있습니다</p>
                <div className="result-actions">
                  <button className="btn btn-ghost" onClick={() => startEndless(chal)} disabled={busy}>
                    같은 문제로 다시 도전
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="result-actions">
                  <button className="btn btn-next full" onClick={sendChallenge} disabled={sendState === "busy"}>
                    {sendLabel("내 기록으로 도전장 보내기")}
                  </button>
                </div>
                <p className="send-hint">{over.mine}문제 연속 정답으로 새 도전장을 만듭니다</p>
                <div className="result-actions">
                  <button className="btn btn-ghost" onClick={() => startEndless()} disabled={busy}>
                    새 판 치기
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {phase === "result" && quiz && (
          <section className="screen result">
            <div className="result-seal" aria-hidden="true">
              <Seal size={216} />
            </div>
            <DocTitle eyebrow="감별결과통지" title="공식전 감별 결과" />
            <StampHero name={grade.name} />
            <p className="stamp-sub">
              10문제 중 {score}문제 적중 · AI에 {10 - score}번 속았습니다
            </p>
            <VForm>
              <VRow label="판정">
                <MiniGrid marks={marks} label={`10문제 중 ${score}문제 정답`} />
              </VRow>
              <VRow label={officialArea ? `${officialArea} 순위` : "전국 순위"}>
                {topPct !== null ? (
                  <>
                    상위 <span className="accent">{topPct}%</span>
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
              <button className="btn btn-ghost" onClick={() => startEndless()} disabled={busy}>
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
          <RuleOverlay game="ox" official={!endless} first={guide.auto} onClose={() => guide.setOpen(false)} />
        )}
      </main>
    </div>
  );
}
