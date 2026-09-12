"use client";

import { mergeStates, type SyncDaily, type SyncEndless, type SyncState } from "./sync";

/**
 * 로그인 사용자의 기록 동기화 (클라이언트).
 * - 비회원: 아무 일도 하지 않는다 (localStorage만).
 * - 로그인: 페이지 진입 시 서버 보관본을 내려받아 병합하고(ensureSynced),
 *   기록이 바뀔 때마다 디바운스로 올린다(schedulePush).
 * - 키 이름은 local.ts / level.ts / 각 게임 페이지의 저장 키와 같아야 한다.
 */

const K = {
  xp: "aptgam:xp",
  streak: "aptgam:streak",
  combo: "aptgam:combo",
  ox: "aptgam:result",
  assemble: "aptgam:assemble",
  findreal: "aptgam:findreal",
  endlessOx: "aptgam:endless:ox",
  endlessAssemble: "aptgam:endless:assemble",
};

/** 동기화 후 화면 갱신용 이벤트 (홈 칩들이 듣는다) */
export const SYNC_EVENT = "aptgam:sync";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readEndless(key: string): SyncEndless | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    if (raw.startsWith("{")) return JSON.parse(raw) as SyncEndless;
    const best = Number(raw) || 0;
    return best > 0 ? { best, avgMs: null } : undefined;
  } catch {
    return undefined;
  }
}

function readDaily(key: string): SyncDaily | undefined {
  const v = readJson<{ date?: string; marks?: boolean[] }>(key);
  return v?.date && Array.isArray(v.marks) ? { date: v.date, marks: v.marks } : undefined;
}

export function collectLocal(): SyncState {
  const out: SyncState = { v: 1 };
  try {
    const xp = Number(localStorage.getItem(K.xp) ?? 0) || 0;
    if (xp > 0) out.xp = xp;
  } catch {
    /* storage 불가 환경 */
  }
  try {
    const area = localStorage.getItem("aptgam:area");
    if (area) out.area = area;
  } catch {
    /* storage 불가 환경 */
  }
  const streak = readJson<{ lastDate: string; count: number }>(K.streak);
  if (streak?.lastDate) out.streak = streak;
  const combo = readJson<SyncState["combo"]>(K.combo);
  if (combo && (combo.best > 0 || combo.current > 0)) out.combo = combo;
  const ox = readEndless(K.endlessOx);
  const assemble = readEndless(K.endlessAssemble);
  if (ox || assemble) out.endless = { ...(ox && { ox }), ...(assemble && { assemble }) };
  const dOx = readDaily(K.ox);
  const dAsm = readDaily(K.assemble);
  const dFind = readDaily(K.findreal);
  if (dOx || dAsm || dFind) {
    out.daily = { ...(dOx && { ox: dOx }), ...(dAsm && { assemble: dAsm }), ...(dFind && { findreal: dFind }) };
  }
  return out;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* 무시 */
  }
}

function applyMerged(merged: SyncState) {
  if (merged.xp !== undefined) write(K.xp, String(merged.xp));
  if (merged.area) write("aptgam:area", merged.area);
  if (merged.streak) write(K.streak, merged.streak);
  if (merged.combo) write(K.combo, merged.combo);
  if (merged.endless?.ox) write(K.endlessOx, merged.endless.ox);
  if (merged.endless?.assemble) write(K.endlessAssemble, merged.endless.assemble);
  if (merged.daily?.ox) {
    // 본편 저장형은 review 필드를 가진다: 같은 날짜의 로컬 review는 보존
    const local = readJson<{ date: string; review?: unknown[] }>(K.ox);
    const review = local?.date === merged.daily.ox.date ? (local.review ?? []) : [];
    write(K.ox, { ...merged.daily.ox, review });
  }
  if (merged.daily?.assemble) write(K.assemble, merged.daily.assemble);
  if (merged.daily?.findreal) write(K.findreal, merged.daily.findreal);
  try {
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    /* 무시 */
  }
}

let loginPromise: Promise<boolean> | null = null;

/** 로그인 여부 (페이지 로드당 1회만 조회) */
export function isLoggedIn(): Promise<boolean> {
  if (!loginPromise) {
    loginPromise = fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: { user: unknown }) => Boolean(m.user))
      .catch(() => false);
  }
  return loginPromise;
}

/** 서버 보관본 내려받기 → 병합 → 로컬 반영 → 병합본 올리기 */
async function syncNow(): Promise<void> {
  const res = await fetch("/api/state");
  if (!res.ok) return;
  const { state } = (await res.json()) as { state: SyncState | null };
  const merged = mergeStates(collectLocal(), state ?? { v: 1 });
  applyMerged(merged);
  await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  }).catch(() => undefined);
}

let syncPromise: Promise<void> | null = null;

/** 페이지 로드당 1회, 로그인 상태면 전체 동기화 */
export function ensureSynced(): Promise<void> {
  if (!syncPromise) {
    syncPromise = isLoggedIn()
      .then((ok) => (ok ? syncNow() : undefined))
      .catch(() => undefined);
  }
  return syncPromise;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** 기록 변경 직후 호출: 로그인 상태면 잠시 뒤 몰아서 올린다 */
export function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    if (!(await isLoggedIn())) return;
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectLocal()),
    }).catch(() => undefined);
  }, 1200);
}
