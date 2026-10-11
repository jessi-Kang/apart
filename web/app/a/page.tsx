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
import { AptPhoto, photoEnabled } from "@/components/AptPhoto";
import { ChallengeResult, RivalLine, SendChallenge, fetchChal, quitChal, rivalRate, type Chal, type Over } from "@/components/Challenge";
import { assembleGradeFor } from "@/lib/grades";
import { areaPref, bumpEndlessRecord, endlessRecord, type EndlessRecord } from "@/lib/local";
import { addXp, type XpResult } from "@/lib/level";
import { mergeMask } from "@/lib/hintmask";
import { hintTimeNote, hintTimes } from "@/lib/hinttime";
import { FINISH_BONUS, RECORD_BONUS, questionScore } from "@/lib/scoring";
import { shareCardImage, type ShareCardData } from "@/lib/sharecard";
import { ShareLink } from "@/components/ShareLink";
import { sfxHint, sfxRecord, sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";

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
  /** 서버가 실제로 좁힌 범위 (시·도). 없으면 전국 */
  sido?: string | null;
  /** 답을 이미 아는 판(같은 도전장을 다시 침). 서버가 정해 준다 */
  practice?: boolean;
}

interface TodayResponse {
  date: string;
  episode: number;
  /** 서버가 실제로 적용한 구역. 빈 문자열이면 전국 공식전 */
  area?: string;
  items: Puzzle[];
}

interface CheckResponse {
  correct: boolean;
  answer: string;
  meta: { location: string; builtYear: number; households: number; geo?: [number, number] | [number, number, number] };
  /** 도전 판이 이 답으로 끝났다 */
  over?: { mine: number; target: number };
}

type Phase = "loading" | "solve" | "reveal" | "done" | "eresult" | "cresult" | "error";

const RESULT_KEY = "aptgam:assemble";
const TIME_LIMIT = 40; // 초 — 조각을 읽고 조립할 시간이 필요하다

const fmtSec = (ms: number | null | undefined) =>
  ms == null ? null : `${(ms / 1000).toFixed(1)}초`;

/** 스크린리더용: "ㄹ○○" → "ㄹ 다음 두 글자 가림" 대신 읽을 수 있는 문장으로 */
const maskLabel = (mask: string) => {
  const open = [...mask].filter((c) => c !== "○");
  return open.length ? `${open.join(" ")} 포함 ${mask.length}글자` : `${mask.length}글자`;
};

export default function AssemblePage() {
  const [quiz, setQuiz] = useState<TodayResponse | null>(null);
  // 처음 온 사람에게는 이용 안내를 덮어서 먼저 보여준다 (그동안 제한 시간은 멈춘다)
  const guide = useGuide("assemble");
  const [phase, setPhase] = useState<Phase>("loading");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  // 힌트 타이머는 예약될 때의 picked를 붙들고 있어서, 그 뒤에 채운 칸을 모른다.
  // ref로 지금 몇 칸을 채웠는지만 따로 들고 간다
  const pickedRef = useRef(0);
  const [reveal, setReveal] = useState<CheckResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">("idle");
  // 도전장: 받은 것(chal)과 그 판의 끝(over), 답을 본 판(retry, 서버가 정함)
  const [chal, setChal] = useState<Chal | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [retry, setRetry] = useState(false);
  const [photoFail, setPhotoFail] = useState(false);
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
  const [officialDone, setOfficialDone] = useState(false); // 오늘 공식전 출전 여부
  const [dTop, setDTop] = useState<number | null>(null); // 공식전 순위 (그날 그 구역 그 창구)
  const [pendingOfficial, setPendingOfficial] = useState(false); // 홈에서 공식전으로 바로 들어왔는가
  const [eTop, setETop] = useState<number | null>(null); // 이 판의 최근 7일 상위 %
  const runTimes = useRef<number[]>([]);
  const sessionTimes = useRef<number[]>([]);
  const startBest = useRef(0);
  const [area, setArea] = useState(""); // 조립은 시·도 단위로 좁힌다 (서버가 정한 범위를 그대로 받는다)
  const qStart = useRef(0);
  // 무한에서 문제마다 쌓는 점수 (lib/scoring.ts). 공식전은 points 상태를 쓴다
  const endlessPts = useRef(0);

  useEffect(() => {
    setERec(endlessRecord("assemble"));
    setArea(areaPref());
    // 홈 대장의 현황 칸에서 바로 들어온 경우(?official=1)는 곧장 공식전을 연다.
    // quiz가 들어온 뒤에 열어야 해서 깃발만 세우고 아래 effect에서 처리한다
    const params = new URLSearchParams(window.location.search);
    const wantOfficial = params.get("official") === "1";
    // 도전장 링크(/c/번호)에서 "도전 접수"로 들어온 경우
    const chalCode = params.get("c");
    const officialArea = areaPref();
    fetch(`/api/assemble/today${officialArea ? `?area=${encodeURIComponent(officialArea)}` : ""}`)
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
        if (chalCode) void openChallenge(chalCode);
        else if (wantOfficial) setPendingOfficial(true);
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
    pickedRef.current = picked.length;
  }, [picked]);

  useEffect(() => {
    if (phase === "solve") qStart.current = Date.now();
  }, [phase, idx, eCount]);

  const puzzle: Puzzle | EndlessPuzzle | undefined = endless ? (epz ?? undefined) : quiz?.items[idx];
  // 힌트 마스크는 정답 토큰 순서 그대로 — 칸마다 제 몫의 초성이 들어간다
  const hintTokens = hintMask ? hintMask.split(" ") : [];

  // 초성 힌트 자동 공개. 시간표는 칸 수를 따라간다 (lib/hinttime.ts)
  useEffect(() => {
    setHintMask(null);
    setHintTier(0);
    if (phase !== "solve" || !puzzle) return;
    const timers = hintTimes(puzzle.answerLen).map((sec, i) =>
      setTimeout(async () => {
        try {
          // 조각은 왼쪽부터 채워지므로 채운 칸은 늘 앞쪽 연속이다.
          // 그 칸들을 알려 주면 서버가 빈 칸을 앞세워 연다 — 이미 푼 칸을
          // 여는 건 힌트가 아니라 아무 일도 안 일어난 것으로 보인다.
          // 다만 수는 tier개 그대로라, 시간이 가면 채운 칸도 결국 열린다.
          const done = pickedRef.current;
          const q = done > 0 ? `&filled=${Array.from({ length: done }, (_, i) => i).join(",")}` : "";
          const url = endless
            ? `/api/endless/assemble/hint?id=${encodeURIComponent((puzzle as EndlessPuzzle).id)}&tier=${i + 1}${q}`
            : `/api/assemble/hint?no=${(puzzle as Puzzle).no}&tier=${i + 1}${quiz?.area ? `&area=${encodeURIComponent(quiz.area)}` : ""}${q}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const { mask } = (await res.json()) as { mask: string };
          // 덮지 않고 더한다. 조각을 비웠다 채웠다 하면 여는 자리가 달라지는데,
          // 덮어쓰면 방금까지 보이던 초성이 사라진다 — 이미 받은 힌트를 도로
          // 가져가는 셈이다
          setHintMask((prev) => mergeMask(prev, mask));
          setHintTier(i + 1);
          sfxHint();
        } catch {
          /* 힌트 실패는 게임 진행에 영향 없음 */
        }
      }, sec * 1000),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, eCount, endless]);

  /** start면 새 판을 연다(code가 있으면 그 도전장의 판). 아니면 지금 판의 다음 문제.
   * 판의 진행과 기록은 서버가 센다 (lib/run.ts) */
  async function fetchEndless(start = false, code?: string) {
    const q = new URLSearchParams();
    if (start) {
      q.set("start", "1");
      const a = areaPref();
      if (code) q.set("c", code);
      else if (a) q.set("area", a);
    }
    const qs = q.toString();
    const res = await fetch(`/api/endless/assemble${qs ? `?${qs}` : ""}`);
    if (!res.ok) throw new Error("endless_failed");
    const data = (await res.json()) as EndlessPuzzle;
    setEpz(data);
    if (start) setRetry(Boolean(data.practice));
    // 자치구를 골랐어도 조립은 그 시·도로 넓혀 낸다. 화면은 실제 범위를 말해야 한다
    setArea(data.sido ?? "");
  }

  async function openChallenge(code: string) {
    try {
      await startEndless(await fetchChal(code));
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
      if (!c && window.location.search.includes("c=")) window.history.replaceState(null, "", "/a");
      setEndless(true);
      setRun(0);
      setECount(0);
      setSHits(0);
      setSBest(0);
      endlessPts.current = 0;
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

  /** 이번 판을 집계에 접수한다 (화면 전환 없음). keepalive는 이탈 중에도 요청을 살린다 */
  function submitEndlessRun(keepalive = false): Promise<number | null> {
    return fetch("/api/endless/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "assemble", best: sBest, hits: sHits, count: eCount, avgMs: sessionAvgMs() }),
      keepalive,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { top: number | null } | null) => d?.top ?? null)
      .catch(() => null);
  }

  const runXp = () => (retry ? 0 : endlessPts.current + (sBest > startBest.current ? RECORD_BONUS : 0));

  function finishEndless() {
    if (sBest > startBest.current) sfxRecord();
    else sfxResult();
    setEXpRes(addXp(runXp(), areaPref()));
    setPhase("eresult");
    setETop(null);
    void submitEndlessRun().then(setETop);
  }

  /** 결과를 안 보고 떠나도 쌓은 것은 남긴다 */
  function abandonEndless(keepalive = false) {
    if (!endless || eCount === 0 || phase === "cresult") return;
    addXp(runXp(), areaPref());
    // 도전 판은 보낸 사람의 구간에서 시작하므로 무한 판 순위에 섞지 않는다
    if (!chal) void submitEndlessRun(keepalive);
  }

  /** 도전 판을 끝내고 대결 통지서를 연다 */
  function finishChallenge() {
    if (over && over.mine > over.target) sfxRecord();
    else sfxResult();
    setEXpRes(addXp(runXp(), areaPref()));
    setPhase("cresult");
  }

  /** 도전 중에 그만둔다. 그때까지의 연속이 내 기록이 된다 */
  async function quitChallenge() {
    setBusy(true);
    try {
      const d = await quitChal("/api/endless/assemble");
      const o: Over = { mine: d?.mine ?? sBest, target: d?.target ?? chal?.target ?? 0, at: null };
      setOver(o);
      if (o.mine > o.target) sfxRecord();
      else sfxResult();
      setEXpRes(addXp(runXp(), areaPref()));
      setPhase("cresult");
    } finally {
      setBusy(false);
    }
  }

  /** 공식전(오늘의 10문제) 참가 */
  function startOfficial() {
    sfxTap();
    abandonEndless(); // 공식전으로 갈아타도 여태 쌓은 판은 접수하고 간다
    setEndless(false);
    setIdx(0);
    setMarks([]);
    setPoints(0);
    setPicked([]);
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
        points?: number;
        topPct?: number | null;
      } | null;
      if (!saved || saved.date !== quiz.date) return;
      sfxTap();
      setEndless(false);
      setMarks(saved.marks);
      setPoints(saved.points ?? 0);
      setDTop(saved.topPct ?? null);
      setXpRes(null); // 경험치는 이미 받았다
      setImgState("idle");
      setPhase("done");
    } catch {
      /* 저장본을 못 읽으면 아무 일도 하지 않는다 */
    }
  }


  /** fromTimeout=true면 미완성 조립이라도 그대로 제출한다 (시간 초과) */
  async function check(fromTimeout = false) {
    if (!puzzle || busy || phase !== "solve") return;
    if (!fromTimeout && picked.length !== puzzle.answerLen) return;
    setBusy(true);
    if (!fromTimeout) sfxTap();
    const dt = Date.now() - qStart.current;
    setPhotoFail(false);
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
            body: JSON.stringify({ date: quiz!.date, no: (puzzle as Puzzle).no, guess, area: quiz!.area ?? "" }),
          });
      if (!res.ok) throw new Error("check_failed");
      const data = (await res.json()) as CheckResponse;
      setReveal(data);
      setTimedOut(fromTimeout && !data.correct);
      if (endless) {
        if (data.over) setOver({ ...data.over, at: eCount + 1, missLabel: "정답", missName: data.answer });
        setECount((c) => c + 1);
        sessionTimes.current.push(dt);
        if (data.correct) {
          runTimes.current.push(dt);
          const nextRun = run + 1;
          endlessPts.current += questionScore("assemble", {
            correct: true,
            elapsedMs: dt,
            hintTier,
            run: nextRun,
            endless: true,
          });
          setRun(nextRun);
          setSHits((h) => h + 1);
          setSBest((b) => Math.max(b, nextRun));
          // 답을 본 판은 개인 최고 기록에 넣지 않는다
          if (!retry) setERec(bumpEndlessRecord("assemble", nextRun, runAvgMs()));
          sfxStampRight();
        } else {
          runTimes.current = [];
          setRun(0);
          sfxStampWrong();
        }
      } else {
        setMarks((m) => [...m, data.correct]);
        // 점수 규칙은 세 창구가 한 곳을 쓴다 (lib/scoring.ts)
        const pts = questionScore("assemble", { correct: data.correct, elapsedMs: dt, hintTier });
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
    if (endless && over) {
      finishChallenge();
      return;
    }
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
    setOfficialDone(true);
    setXpRes(addXp(points + FINISH_BONUS, quiz?.area ?? "")); // 문제 점수 + 완주 보너스
    setPhase("done");
    // 공식전 완주 접수: 그날 그 구역 조립 참가자끼리의 순위
    setDTop(null);
    const score = marks.filter(Boolean).length;
    void fetch("/api/assemble/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: quiz.date, score, area: quiz.area ?? "" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { top: number | null } | null) => {
        setDTop(d?.top ?? null);
        try {
          localStorage.setItem(RESULT_KEY, JSON.stringify({ date: quiz.date, marks, points, topPct: d?.top ?? null, area: quiz.area ?? "" }));
        } catch {
          /* 무시 */
        }
      })
      .catch(() => undefined);
  }

  const success = marks.filter(Boolean).length;
  const total = quiz?.items.length ?? 10;
  const dGrade = assembleGradeFor(success);
  const eRate = eCount > 0 ? sHits / eCount : 0;
  const eGradeName = sBest > startBest.current ? "신기록 갱신" : eRate >= 0.7 ? "조립 숙련" : "조립 수련";

  /** 공유 카드 내용. 통지서(이미지)와 링크 공유가 같은 값을 쓴다 */
  const officialCard = (): ShareCardData => ({
      episode: quiz?.episode ?? 0,
      date: quiz?.date ?? "",
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
        { value: `+${xpRes?.gained ?? 0}점`, label: "획득 경험치" },
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



  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          힌트를 보고
          <br />
          실존 단지명을 <em>조립</em>하십시오
        </h2>
        <p className="note">조각에는 함정이 섞여 있습니다.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/" onClick={() => abandonEndless(true)}>
            아파트 감별사
            <small>
              {chal
                ? `도전장 · ${chal.label || "익명"}`
                : endless
                  ? area
                    ? `무한 조립 · ${area.replace(/특별자치시$|특별시$|광역시$/, "")}`
                    : "무한 조립"
                  : officialName}
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
            <p className="center-note">조립 문제를 준비하고 있습니다</p>
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
            {chal ? (
              <RivalLine chal={chal} run={run} nth={eCount + (phase === "solve" ? 1 : 0)} />
            ) : endless ? (
              <p className="qlabel mono qlabel-row">
                <span className="mode-chip">무한</span>
                {eCount + (phase === "solve" ? 1 : 0)}번째 · 연속 {run} · 최고 {eRec.best}
              </p>
            ) : (
              <p className="qlabel mono qlabel-row">
                <span className="mode-chip official">{officialName}</span>
                {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </p>
            )}
            <p className="task-line">아래 주소의 <b>단지 이름</b>을 조립하세요.</p>
            <div className="hintcard paper-in" key={endless ? `e${eCount}` : (puzzle as Puzzle).no}>
              {/* 주소는 제 줄을 준다. 앞 문구에 이어 붙이면 "서울특별시 / 구로구 개봉동"처럼
                  주소 한가운데서 줄이 꺾인다 */}
              <b>{puzzle.hint.location}</b>
              <span className="hm">
                {puzzle.hint.builtYear}년 준공 · {puzzle.hint.households.toLocaleString()}세대
              </span>
            </div>

            {/* 힌트가 언제 열리는지 모르면 그냥 시간이 흐르는 것으로만 보인다 */}
            <p className="hint-when">
              {hintTier > 0
                ? `초성 ${hintTier}단계 공개됨 · 정답 칸에 표시`
                : hintTimeNote(puzzle.answerLen)}
            </p>

            <TimerBar
              seconds={TIME_LIMIT}
              active={phase === "solve" && !guide.open}
              resetKey={endless ? `e${eCount}` : idx}
              onExpire={() => check(true)}
            />

            <div className="slots">
              {Array.from({ length: puzzle.answerLen }, (_, k) => {
                const p = picked[k];
                const mask = phase === "solve" ? hintTokens[k] : undefined;
                return (
                  <button
                    key={k}
                    className={`slot ${p !== undefined ? "filled" : ""}`}
                    onClick={() => unpick(k)}
                    aria-label={mask ? `칸 ${k + 1}, 초성 힌트 ${maskLabel(mask)}` : `칸 ${k + 1}`}
                  >
                    {p !== undefined ? (
                      puzzle.pieces[p]
                    ) : mask ? (
                      <span className="sh" aria-hidden="true">
                        {[...mask].map((ch, i) =>
                          ch === "○" ? <i key={i} /> : <b key={i}>{ch}</b>,
                        )}
                      </span>
                    ) : (
                      ""
                    )}
                  </button>
                );
              })}
            </div>
            {phase === "solve" && hintTier > 0 && !endless && (
              <p className="hint-note">
                초성 힌트 {hintTier}칸 공개 · 맞히면 <b>−{hintTier * 4}점</b>
              </p>
            )}
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
                  {/* 진짜 단지 항공사진: 칸 오른쪽 위(감별 O/X와 같은 자리, 시안 photo-a 1번) */}
                  <div className={photoEnabled(reveal.meta.geo) && !photoFail ? "with-thumb" : undefined}>
                    <div className="verdict-txt">
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
                    {reveal.meta.geo && photoEnabled(reveal.meta.geo) && !photoFail && (
                      <AptPhoto
                        key={reveal.answer}
                        geo={reveal.meta.geo}
                        name={reveal.answer}
                        caption={`${reveal.meta.location} · ${reveal.meta.builtYear}년 준공 · ${reveal.meta.households.toLocaleString()}세대`}
                        onLoadFail={() => setPhotoFail(true)}
                      />
                    )}
                  </div>
                </div>
                {endless && (
                  <p className="combo-line">
                    {chal ? (
                      rivalRate(chal, run, reveal.correct)
                    ) : reveal.correct ? (
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
                  {(!endless && idx + 1 === total) || (endless && over) ? "결과 보기" : "다음 문제"}
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
            <DocTitle eyebrow="조립결과통지" title="무한 조립 결과" />
            <StampHero name={eGradeName} />
            <p className="stamp-sub">
              {eCount}문제 중 {sHits}문제 조립 · 최고 연속 {sBest}
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
            {/* 통지서 공유 자리를 도전장이 이어받는다(감별 O/X와 같다) */}
            <SendChallenge mode="assemble" best={sBest} />
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
          <ChallengeResult
            mode="assemble"
            chal={chal}
            over={over}
            retry={retry}
            xp={eXpRes}
            busy={busy}
            onNewRun={() => startEndless()}
            onRetry={() => startEndless(chal)}
          />
        )}

        {phase === "done" && quiz && (
          <section className="screen result">
            <div className="result-seal" aria-hidden="true">
              <Seal size={216} />
            </div>
            <DocTitle eyebrow="조립결과통지" title="공식전 조립 결과" />
            <StampHero name={dGrade.name} />
            <p className="stamp-sub">
              {total}문제 중 {success}문제 조립 · 이번 판 {points}점
            </p>
            <VForm>
              <VRow label="판정">
                <MiniGrid marks={marks} label={`${total}문제 중 ${success}문제 조립 성공`} />
              </VRow>
              <VRow label="조립 점수">
                <span className="accent">{points}점</span> <small>속도·힌트 반영</small>
              </VRow>
              <VRow label="무한 기록">
                최고 연속 {eRec.best}
                {fmtSec(eRec.avgMs) && <small>평균 {fmtSec(eRec.avgMs)}</small>}
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
          <RuleOverlay game="assemble" official={!endless} first={guide.auto} onClose={() => guide.setOpen(false)} />
        )}
      </main>
    </div>
  );
}
