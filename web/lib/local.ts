"use client";

/**
 * 게스트 로컬 기록 (docs/07 §2-1): 스트릭·오늘의 결과는 localStorage.
 * 모든 접근은 try/catch (프라이빗 모드 등에서 storage가 던질 수 있음).
 */

import { schedulePush } from "./cloud";

export interface ReviewItem {
  no: number;
  name: string;
  kind: "real" | "fake";
  correct: boolean;
}

export interface SavedResult {
  date: string;
  marks: boolean[];
  review: ReviewItem[];
  /** 집계에서 받은 전국 상위 % — 성적표를 다시 열 때 그대로 보여준다 */
  topPct?: number | null;
}

const RESULT_KEY = "aptgam:result";
const STREAK_KEY = "aptgam:streak";

export function loadResult(date: string): SavedResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedResult;
    return parsed.date === date ? parsed : null;
  } catch {
    return null;
  }
}

export function saveResult(result: SavedResult) {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));
  } catch {
    /* 저장 실패는 무시: 게임은 계속 진행 가능 */
  }
  schedulePush();
}

interface StreakState {
  lastDate: string;
  count: number;
}

function prevDateOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10);
}

/** 오늘 완주 시 호출. 어제 완주했으면 +1, 아니면 1로 리셋 */
export function bumpStreak(date: string): number {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const prev = raw ? (JSON.parse(raw) as StreakState) : null;
    let count = 1;
    if (prev) {
      if (prev.lastDate === date) return prev.count;
      if (prev.lastDate === prevDateOf(date)) count = prev.count + 1;
    }
    localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: date, count } satisfies StreakState));
    schedulePush();
    return count;
  } catch {
    return 1;
  }
}

/** 진짜 찾기 연속 콤보 (docs/06 모드 3 — 날짜를 넘어 이어지는 기록 갱신형).
 * 현재 콤보의 누적 풀이 시간도 함께 담아, 최고 기록 갱신 시 그때의
 * 라운드당 평균 시간을 남긴다 (무한 모드 시간 비교용) */
export interface ComboState {
  current: number;
  best: number;
  runTotalMs?: number;
  runCount?: number;
  bestAvgMs?: number | null;
}

const COMBO_KEY = "aptgam:combo";

export function comboState(): ComboState {
  try {
    const raw = localStorage.getItem(COMBO_KEY);
    if (!raw) return { current: 0, best: 0 };
    return JSON.parse(raw) as ComboState;
  } catch {
    return { current: 0, best: 0 };
  }
}

/** 라운드 판정마다 호출: 적중이면 +1, 오판이면 0. 최고 기록·평균 시간 동시 갱신 */
export function applyComboPick(correct: boolean, dtMs?: number): ComboState {
  const prev = comboState();
  let next: ComboState;
  if (correct) {
    const current = prev.current + 1;
    const runTotalMs = (prev.runTotalMs ?? 0) + (dtMs ?? 0);
    const runCount = (prev.runCount ?? 0) + (dtMs !== undefined ? 1 : 0);
    const isNewBest = current > prev.best;
    next = {
      current,
      best: isNewBest ? current : prev.best,
      runTotalMs,
      runCount,
      bestAvgMs: isNewBest && runCount > 0 ? Math.round(runTotalMs / runCount) : (prev.bestAvgMs ?? null),
    };
  } else {
    next = { current: 0, best: prev.best, runTotalMs: 0, runCount: 0, bestAvgMs: prev.bestAvgMs ?? null };
  }
  try {
    localStorage.setItem(COMBO_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  schedulePush();
  return next;
}

/** 무한 모드 최고 연속 기록 (모드별). avgMs = 그 기록을 세울 때의 문제당 평균 풀이 시간 */
export interface EndlessRecord {
  best: number;
  avgMs: number | null;
}

export function endlessRecord(mode: "ox" | "assemble"): EndlessRecord {
  try {
    const raw = localStorage.getItem(`aptgam:endless:${mode}`);
    if (!raw) return { best: 0, avgMs: null };
    if (raw.startsWith("{")) return JSON.parse(raw) as EndlessRecord;
    return { best: Number(raw) || 0, avgMs: null }; // 구버전(숫자만 저장) 호환
  } catch {
    return { best: 0, avgMs: null };
  }
}

export function bumpEndlessRecord(mode: "ox" | "assemble", streak: number, avgMs: number | null): EndlessRecord {
  const prev = endlessRecord(mode);
  const next = streak > prev.best ? { best: streak, avgMs } : prev;
  try {
    localStorage.setItem(`aptgam:endless:${mode}`, JSON.stringify(next));
  } catch {
    /* 무시 */
  }
  schedulePush();
  return next;
}

/** 홈 표시용: 오늘 기준 유효한 스트릭 (오늘 또는 어제 완주 기록만 인정) */
export function currentStreak(date: string): { count: number; playedToday: boolean } {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { count: 0, playedToday: false };
    const s = JSON.parse(raw) as StreakState;
    if (s.lastDate === date) return { count: s.count, playedToday: true };
    if (s.lastDate === prevDateOf(date)) return { count: s.count, playedToday: false };
    return { count: 0, playedToday: false };
  } catch {
    return { count: 0, playedToday: false };
  }
}
