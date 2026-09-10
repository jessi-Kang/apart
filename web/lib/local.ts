"use client";

/**
 * 게스트 로컬 기록 (docs/07 §2-1): 스트릭·오늘의 결과는 localStorage.
 * 모든 접근은 try/catch (프라이빗 모드 등에서 storage가 던질 수 있음).
 */

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
    return count;
  } catch {
    return 1;
  }
}

/** 진짜 찾기 연속 콤보 (docs/06 모드 3 — 날짜를 넘어 이어지는 기록 갱신형) */
interface ComboState {
  current: number;
  best: number;
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

/** 라운드 판정마다 호출: 적중이면 +1, 오판이면 0. 최고 기록 동시 갱신 */
export function applyComboPick(correct: boolean): ComboState {
  const prev = comboState();
  const current = correct ? prev.current + 1 : 0;
  const next = { current, best: Math.max(prev.best, current) };
  try {
    localStorage.setItem(COMBO_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  return next;
}

/** 무한 모드 최고 연속 기록 (모드별) */
export function endlessBest(mode: "ox" | "assemble"): number {
  try {
    return Number(localStorage.getItem(`aptgam:endless:${mode}`) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function bumpEndlessBest(mode: "ox" | "assemble", streak: number): number {
  const best = Math.max(endlessBest(mode), streak);
  try {
    localStorage.setItem(`aptgam:endless:${mode}`, String(best));
  } catch {
    /* 무시 */
  }
  return best;
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
