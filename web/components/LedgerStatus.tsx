"use client";

import { useEffect, useState } from "react";
import { SYNC_EVENT } from "@/lib/cloud";
import { comboState, endlessRecord } from "@/lib/local";

/**
 * 접수 대장(홈)의 살아있는 칸들.
 * - DailyChop: 창구별 현황 도장 — 오늘 완주 전 "접수중"(인주색), 완주 후 "완료"(잉크색)
 * - OxTail / FindTail: 창구 설명 뒤에 붙는 개인 기록(연속 접수, 최고 연속)
 * 모두 localStorage 기반이라 클라이언트 전용이고, 계정 동기화(SYNC_EVENT) 후 갱신된다.
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

/** 무한 기록 꼬리: 최고 연속 (없으면 도전 문구) */
export function RecTail({ mode }: { mode: "ox" | "assemble" }) {
  const [tail, setTail] = useState("연속 기록 도전");
  useEffect(() => {
    const refresh = () => {
      const { best } = endlessRecord(mode);
      if (best > 0) setTail(`최고 연속 ${best}`);
    };
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, [mode]);
  return <>{tail}</>;
}

/** 진짜 찾기 설명 꼬리: 최고 연속 */
export function FindTail() {
  const [tail, setTail] = useState("연속 기록 도전");
  useEffect(() => {
    const refresh = () => {
      const { best } = comboState();
      if (best > 0) setTail(`최고 연속 ${best}`);
    };
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, []);
  return <>{tail}</>;
}
