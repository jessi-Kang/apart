"use client";

import { useEffect, useState } from "react";
import { SYNC_EVENT } from "@/lib/cloud";
import { comboState, currentStreak } from "@/lib/local";

/**
 * 접수 대장(홈)의 살아있는 칸들.
 * - DailyChop: 창구별 현황 도장 — 오늘 완주 전 "접수중"(인주색), 완주 후 "완료"(잉크색)
 * - OxTail / FindTail: 창구 설명 뒤에 붙는 개인 기록(연속 접수, 최고 콤보)
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
  // 본편 완주는 "끝"이 아니라 무한 코스 개장 — 게임은 언제나 계속된다
  return <span className={done ? "chop done" : "chop"}>{done ? "무한 개장" : "접수중"}</span>;
}

/** 본편 설명 꼬리: 연속 접수 일수 */
export function OxTail({ date }: { date: string }) {
  const [tail, setTail] = useState("");
  useEffect(() => {
    const refresh = () => {
      const { count } = currentStreak(date);
      setTail(count > 0 ? ` · ${count}일 연속` : "");
    };
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, [date]);
  return <>{tail}</>;
}

/** 진짜 찾기 설명 꼬리: 최고 콤보 */
export function FindTail() {
  const [tail, setTail] = useState(" · 매일 10라운드");
  useEffect(() => {
    const refresh = () => {
      const { best } = comboState();
      if (best > 0) setTail(` · 최고 콤보 ${best}`);
    };
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, []);
  return <>{tail}</>;
}
