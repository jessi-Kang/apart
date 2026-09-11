"use client";

import { useEffect, useState } from "react";
import { comboState, currentStreak } from "@/lib/local";

/** 홈 카드의 복귀 루프 상태 표시: "오늘 미접수 · N일 연속" (docs/06 홈 화면 원칙) */
export function HomeStatus({ date }: { date: string }) {
  const [text, setText] = useState("오늘 미접수");

  useEffect(() => {
    const { count, playedToday } = currentStreak(date);
    const head = playedToday ? "오늘 접수 완료" : "오늘 미접수";
    setText(count > 0 ? `${head} · ${count}일 연속 감별 중` : head);
  }, [date]);

  return <>{text}</>;
}

/** 진짜 찾기 카드 상태: 최고 콤보를 상시 노출해 깨러 오게 한다 (docs/06) */
export function ComboStatus() {
  const [text, setText] = useState("매일 10라운드");

  useEffect(() => {
    const { current, best } = comboState();
    if (best === 0) return;
    setText(current > 0 ? `연속 ${current}개 적중 중 · 최고 ${best}` : `최고 콤보 ${best} 갱신 도전`);
  }, []);

  return <>{text}</>;
}
