"use client";

import { useState } from "react";
import { DocTitle, StampHero, VForm, VRow } from "./VerdictForm";
import { LevelBar } from "./LevelBar";
import { shareLink } from "@/lib/sharecard";
import { sfxTap } from "@/lib/sound";
import type { XpResult } from "@/lib/level";

/**
 * 도전장 화면 부품. 감별 O/X에서 먼저 만들고 세 창구(감별·조립·찾기)가 같이 쓰도록
 * 떼어 냈다 — 창구마다 따로 두면 문구가 갈라진다("연속 2·분패"를 풀어 쓴 것처럼
 * 한 곳을 고치면 나머지가 옛 말로 남는다).
 */

export type ChalMode = "ox" | "findreal" | "assemble";

/** 받은 도전장 (겉면만. 시드는 서버에만 있다) */
export interface Chal {
  code: string;
  target: number;
  label: string;
}

/** 도전 판의 끝. at은 끊긴 문제 번호(그만두었으면 null). miss*는 끊긴 문제를 보여 줄 한 줄 */
export interface Over {
  mine: number;
  target: number;
  at: number | null;
  missLabel?: string;
  missName?: string | null;
  missNote?: string;
}

export async function fetchChal(code: string): Promise<Chal> {
  const res = await fetch(`/api/challenge/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error("challenge_failed");
  return (await res.json()) as Chal;
}

/** 도전 중에 그만둔다. 그때까지의 연속이 내 기록이 된다 (넘긴 채 멈추는 경우) */
export async function quitChal(endpoint: string): Promise<{ mine: number; target: number } | null> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ end: true }),
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { over: { mine: number; target: number } }).over;
}

export const outcomeOf = (o: Over) => (o.mine > o.target ? "승리" : o.mine === o.target ? "무승부" : "패배");

/** 도전장 보내기. 기록은 서버가 센 이 판의 것이 실린다(요청에 숫자를 싣지 않는다) */
function useSend(mode: ChalMode) {
  const [state, setState] = useState<"idle" | "busy" | "shared" | "copied" | "failed">("idle");
  async function send() {
    if (state === "busy") return;
    sfxTap();
    setState("busy");
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("challenge_failed");
      const { code, target } = (await res.json()) as { code: string; target: number };
      const url = `${window.location.origin}/c/${code}`;
      setState(await shareLink(`[아파트 감별사] 도전장\n나는 ${target}문제를 연속으로 맞혔다. 넘어 볼래?\n${url}`));
    } catch {
      setState("failed");
    }
  }
  const label = (idle: string) =>
    state === "busy"
      ? "보내는 중"
      : state === "shared"
        ? "보냈습니다"
        : state === "copied"
          ? "링크 복사됨"
          : state === "failed"
            ? "다시 시도"
            : idle;
  return { send, label, busy: state === "busy" };
}

/** 무한 판 결과의 도전장 단추 (통지서 공유 자리를 이어받았다) */
export function SendChallenge({ mode, best }: { mode: ChalMode; best: number }) {
  const s = useSend(mode);
  return (
    <>
      <div className="result-actions">
        <button className="btn btn-next full" onClick={s.send} disabled={s.busy || best < 1}>
          {s.label("도전장 보내기")}
        </button>
      </div>
      <p className="send-hint">
        {best < 1 ? "한 문제라도 맞혀야 도전장을 보낼 수 있습니다" : `${best}문제 연속으로 맞힌 그 문제들이 같은 순서로 나갑니다`}
      </p>
    </>
  );
}

/** 도전 중: 상대 기록까지 얼마나 남았는지. 설명은 얹지 않고 막대 하나와 한 줄만 */
export function RivalLine({ chal, run, nth }: { chal: Chal; run: number; nth: number }) {
  return (
    <>
      <div className="rival" aria-label={`상대 기록 ${chal.target} 중 ${run}`}>
        <i style={{ width: `${Math.min(100, (run / Math.max(1, chal.target)) * 100)}%` }} />
      </div>
      <p className="qlabel mono qlabel-row">
        <span className="mode-chip official">도전장</span>
        {nth}번째 · 연속 정답 {run} / 상대 {chal.target}
      </p>
    </>
  );
}

/** 정답 공개 밑 한 줄 (도전 중) */
export const rivalRate = (chal: Chal, run: number, correct: boolean) =>
  correct
    ? run > chal.target
      ? `${run}문제 연속 정답 · 상대를 넘었습니다`
      : `${run}문제 연속 정답 · ${chal.target - run + 1}문제 더 맞히면 승리`
    : "여기서 끝났습니다";

/** 대결 통지서 */
export function ChallengeResult({
  mode,
  chal,
  over,
  retry,
  xp,
  busy,
  onNewRun,
  onRetry,
}: {
  mode: ChalMode;
  chal: Chal;
  over: Over;
  /** 답을 본 판(같은 도전장을 다시 침). 서버가 정해 준다 */
  retry: boolean;
  xp: XpResult | null;
  busy: boolean;
  onNewRun: () => void;
  onRetry: () => void;
}) {
  const s = useSend(mode);
  const outcome = outcomeOf(over);
  return (
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
        {over.at && over.missName && (
          <VRow label={over.missLabel ?? "틀린 문제"}>
            {over.missName} {over.missNote && <small>{over.missNote}</small>}
          </VRow>
        )}
        <VRow label="직급">
          <LevelBar result={xp} />
        </VRow>
      </VForm>
      <div className="cut" />
      {outcome === "패배" || retry ? (
        <>
          <div className="result-actions">
            <button className="btn btn-next full" onClick={onNewRun} disabled={busy}>
              새 판 치기
            </button>
          </div>
          <p className="send-hint">새 판의 기록으로 도전장을 보낼 수 있습니다</p>
          <div className="result-actions">
            <button className="btn btn-ghost" onClick={onRetry} disabled={busy}>
              같은 문제로 다시 도전
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="result-actions">
            <button className="btn btn-next full" onClick={s.send} disabled={s.busy}>
              {s.label("내 기록으로 도전장 보내기")}
            </button>
          </div>
          <p className="send-hint">{over.mine}문제 연속 정답으로 새 도전장을 만듭니다</p>
          <div className="result-actions">
            <button className="btn btn-ghost" onClick={onNewRun} disabled={busy}>
              새 판 치기
            </button>
          </div>
        </>
      )}
    </section>
  );
}
