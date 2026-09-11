/** 결정적 데일리 출제용 시드 난수 (docs/02 §2 — 전원 동일 문제) */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 구역 이름을 숫자로 (FNV-1a). 구역별 공식전은 문제가 서로 달라야 한다 —
 * 같은 날 같은 구역을 고른 사람끼리만 문제가 같으면 순위가 성립한다.
 */
export function areaSeed(area?: string | null): number {
  if (!area) return 0;
  let h = 2166136261;
  for (let i = 0; i < area.length; i++) {
    h ^= area.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 날짜(YYYY-MM-DD) + 모드 오프셋 + 구역 → 그날 그 구역의 난수열 */
export function rngForDate(date: string, offset = 0, area?: string | null) {
  return mulberry32((Number(date.replaceAll("-", "")) + offset + areaSeed(area)) >>> 0);
}
