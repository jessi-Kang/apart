"use client";

import { useEffect, useRef, useState } from "react";
import type { Grade } from "@/lib/grades";
import { sfxTick } from "@/lib/sound";

/** 결과 점수 카운트업: 0에서 촤르륵 올라간다. reduced-motion이면 즉시 최종값 */
export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    const stepMs = Math.min(90, 600 / value);
    let cur = 0;
    const iv = setInterval(() => {
      cur += 1;
      setN(cur);
      sfxTick();
      if (cur >= value) clearInterval(iv);
    }, stepMs);
    return () => clearInterval(iv);
  }, [value]);

  return <>{n}</>;
}

/** 등급 사다리: 전체 등급 중 현재 위치와 다음 등급까지 남은 문제 수 */
export function GradeLadder({ grades, score, unit = "문제" }: { grades: Grade[]; score: number; unit?: string }) {
  const idx = grades.reduce((acc, g, i) => (score >= g.min ? i : acc), 0);
  const next = grades[idx + 1];
  return (
    <div className="ladder" aria-label="등급 진행도">
      <div className="steps" aria-hidden="true">
        {grades.map((g, i) => (
          <i key={g.name} className={i <= idx ? "on" : ""} />
        ))}
      </div>
      <span className="ladder-note">
        {next ? (
          <>
            다음 등급 「{next.name}」까지 <b>{next.min - score}{unit}</b>
          </>
        ) : (
          <>최고 등급 달성 — 더 올라갈 곳이 없습니다</>
        )}
      </span>
    </div>
  );
}

/** 기록 게이지 (무한 세션): 이번 기록이 역대 최고 대비 어디까지 왔나 */
export function RecordGauge({ session, best, unit = "연속" }: { session: number; best: number; unit?: string }) {
  const target = Math.max(best, session, 1);
  const pct = Math.round((session / target) * 100);
  const isNew = session >= best && session > 0;
  return (
    <div className="gauge-wrap" aria-label="기록 게이지">
      <div className="gauge">
        <i style={{ transform: `scaleX(${pct / 100})` }} className={isNew ? "new" : ""} />
      </div>
      <span className="ladder-note">
        {best <= 0 && session <= 0 ? (
          <>첫 기록을 세워 보세요</>
        ) : isNew ? (
          <>
            이번 세션이 <b>역대 최고</b>입니다
          </>
        ) : (
          <>
            역대 최고 {best}{unit}까지 <b>{best - session}{unit}</b> 남았습니다
          </>
        )}
      </span>
    </div>
  );
}
