"use client";

import { useEffect, useState } from "react";
import { currentStreak } from "@/lib/local";

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
