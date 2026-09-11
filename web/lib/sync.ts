/**
 * 계정 기록 동기화의 공통 규약 (서버/클라이언트 공용).
 * - 게스트(비회원)는 localStorage에만 기록이 남고, 구글 로그인 시
 *   이 형태로 묶어 서버(user_state.state jsonb)에 보관한다.
 * - 병합은 "잃지 않는 쪽"으로: 점수·기록은 큰 값, 날짜 기록은 최신 날짜.
 *   서버도 저장 전에 같은 병합을 거쳐 기기 간 늦은 쓰기가 기록을 덮지 않게 한다.
 */

export interface SyncCombo {
  current: number;
  best: number;
  runTotalMs?: number;
  runCount?: number;
  bestAvgMs?: number | null;
}

export interface SyncEndless {
  best: number;
  avgMs: number | null;
}

export interface SyncDaily {
  date: string;
  marks: boolean[];
}

export interface SyncState {
  v: 1;
  xp?: number;
  streak?: { lastDate: string; count: number };
  combo?: SyncCombo;
  endless?: { ox?: SyncEndless; assemble?: SyncEndless };
  daily?: { ox?: SyncDaily; assemble?: SyncDaily; findreal?: SyncDaily };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NUM = 10_000_000;

const num = (x: unknown): number | null =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= MAX_NUM ? Math.round(x) : null;

function cleanDaily(x: unknown): SyncDaily | undefined {
  if (!x || typeof x !== "object") return undefined;
  const { date, marks } = x as { date?: unknown; marks?: unknown };
  if (typeof date !== "string" || !DATE_RE.test(date)) return undefined;
  if (!Array.isArray(marks) || marks.length > 12) return undefined;
  return { date, marks: marks.map(Boolean) };
}

function cleanEndless(x: unknown): SyncEndless | undefined {
  if (!x || typeof x !== "object") return undefined;
  const best = num((x as { best?: unknown }).best);
  if (best === null) return undefined;
  const avg = num((x as { avgMs?: unknown }).avgMs);
  return { best, avgMs: avg };
}

/** 신뢰할 수 없는 입력(클라이언트 PUT 본문)을 규약 형태로 정리한다 */
export function sanitizeState(x: unknown): SyncState {
  const out: SyncState = { v: 1 };
  if (!x || typeof x !== "object") return out;
  const s = x as Record<string, unknown>;

  const xp = num(s.xp);
  if (xp !== null) out.xp = xp;

  if (s.streak && typeof s.streak === "object") {
    const { lastDate, count } = s.streak as { lastDate?: unknown; count?: unknown };
    const c = num(count);
    if (typeof lastDate === "string" && DATE_RE.test(lastDate) && c !== null) {
      out.streak = { lastDate, count: c };
    }
  }

  if (s.combo && typeof s.combo === "object") {
    const c = s.combo as Record<string, unknown>;
    const current = num(c.current);
    const best = num(c.best);
    if (current !== null && best !== null) {
      out.combo = {
        current,
        best,
        runTotalMs: num(c.runTotalMs) ?? 0,
        runCount: num(c.runCount) ?? 0,
        bestAvgMs: num(c.bestAvgMs),
      };
    }
  }

  if (s.endless && typeof s.endless === "object") {
    const e = s.endless as Record<string, unknown>;
    const ox = cleanEndless(e.ox);
    const assemble = cleanEndless(e.assemble);
    if (ox || assemble) out.endless = { ...(ox && { ox }), ...(assemble && { assemble }) };
  }

  if (s.daily && typeof s.daily === "object") {
    const d = s.daily as Record<string, unknown>;
    const ox = cleanDaily(d.ox);
    const assemble = cleanDaily(d.assemble);
    const findreal = cleanDaily(d.findreal);
    if (ox || assemble || findreal) {
      out.daily = { ...(ox && { ox }), ...(assemble && { assemble }), ...(findreal && { findreal }) };
    }
  }
  return out;
}

function laterDaily(a?: SyncDaily, b?: SyncDaily): SyncDaily | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  return b.marks.length >= a.marks.length ? b : a;
}

function betterEndless(a?: SyncEndless, b?: SyncEndless): SyncEndless | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.best > a.best ? b : a;
}

/** 두 기록을 잃는 것 없이 병합한다. b는 보통 "들어온 쪽"(같으면 b 우선) */
export function mergeStates(a: SyncState, b: SyncState): SyncState {
  const out: SyncState = { v: 1 };

  const xp = Math.max(a.xp ?? 0, b.xp ?? 0);
  if (xp > 0) out.xp = xp;

  if (a.streak || b.streak) {
    const sa = a.streak;
    const sb = b.streak;
    if (!sa) out.streak = sb;
    else if (!sb) out.streak = sa;
    else if (sa.lastDate !== sb.lastDate) out.streak = sa.lastDate > sb.lastDate ? sa : sb;
    else out.streak = sa.count > sb.count ? sa : sb;
  }

  if (a.combo || b.combo) {
    const ca = a.combo ?? { current: 0, best: 0 };
    const cb = b.combo ?? { current: 0, best: 0 };
    const bestSide = cb.best >= ca.best ? cb : ca;
    const curSide = cb.current >= ca.current ? cb : ca;
    out.combo = {
      current: curSide.current,
      best: bestSide.best,
      runTotalMs: curSide.runTotalMs ?? 0,
      runCount: curSide.runCount ?? 0,
      bestAvgMs: bestSide.bestAvgMs ?? null,
    };
  }

  const ox = betterEndless(a.endless?.ox, b.endless?.ox);
  const assemble = betterEndless(a.endless?.assemble, b.endless?.assemble);
  if (ox || assemble) out.endless = { ...(ox && { ox }), ...(assemble && { assemble }) };

  const dOx = laterDaily(a.daily?.ox, b.daily?.ox);
  const dAsm = laterDaily(a.daily?.assemble, b.daily?.assemble);
  const dFind = laterDaily(a.daily?.findreal, b.daily?.findreal);
  if (dOx || dAsm || dFind) {
    out.daily = { ...(dOx && { ox: dOx }), ...(dAsm && { assemble: dAsm }), ...(dFind && { findreal: dFind }) };
  }
  return out;
}
