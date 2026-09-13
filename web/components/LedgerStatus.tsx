"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SYNC_EVENT } from "@/lib/cloud";
import { coinedCount } from "@/lib/local";

/**
 * 접수 대장(홈) 현황 칸의 살아있는 표시.
 * 아직 안 치렀으면 "출전하기 ›"(권유), 치렀으면 "성적표" 도장이다.
 * localStorage 기반이라 클라이언트 전용이고, 계정 동기화(SYNC_EVENT) 후 갱신된다.
 */

const KEY_BY_MODE = { ox: "aptgam:result", assemble: "aptgam:assemble", findreal: "aptgam:findreal" } as const;

function doneToday(mode: keyof typeof KEY_BY_MODE, date: string): boolean {
  try {
    const raw = localStorage.getItem(KEY_BY_MODE[mode]);
    if (!raw) return false;
    return (JSON.parse(raw) as { date?: string }).date === date;
  } catch {
    return false;
  }
}

export function DailyChop({ mode, date }: { mode: keyof typeof KEY_BY_MODE; date: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const refresh = () => setDone(doneToday(mode, date));
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, [mode, date]);
  // 도장은 "이미 찍힌 것"이다. 아직 안 친 공식전에 도장을 찍어 두면
  // "출전 완료"로 읽힌다. 치르기 전에는 도장 대신 권유 문구를 쓴다.
  return done ? (
    <span className="chop done">성적표</span>
  ) : (
    <span className="chop-go">
      출전하기
      <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
        <path d="M2.6 1.2L6 4.5 2.6 7.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * 작명소의 현황.
 *
 * 작명소에는 공식전이 없다 — 답이 없는 창구라 같은 10문제로 줄 세울 것이
 * 없다. 그래서 이 칸은 출전구가 아니라 말 그대로 현황이다: 지금까지 몇 개
 * 접수했는지, 그리고 그 이름들이 몇 명을 속였는지 보러 가는 문이다.
 *
 * 수는 이 기기 기록으로 센다. 진짜 숫자는 서버가 알지만 대장 한 칸 때문에
 * 홈에서 매번 물어볼 일은 아니다 — 정확한 값은 눌러서 들어간 곳에 있다.
 */
export function CoinChop() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => setN(coinedCount());
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, []);
  // 접수 전에는 도장을 찍지 않는다. 도장은 이미 일어난 일에만 쓴다
  if (n === 0) return <span className="chop off">접수 전</span>;
  return (
    <Link className="chop done" href="/me">
      이름 {n}
    </Link>
  );
}
