import { poolOf, type Apartment, type FakeName, type Difficulty } from "./data";
import { rngForDate, seededShuffle } from "./seeded";

/**
 * 데일리 출제 (docs/02 §2)
 * - 전원 동일: KST 날짜를 시드로 한 결정적 선택
 * - 진짜:가짜 비율 4:6 ~ 6:4 랜덤
 * - 난이도 커브: 1~2 쉬움 → 3~7 중간 → 8~10 어려움 위주
 * - TODO(M2): 90일 재출제 금지는 출제 이력 테이블 도입 후 적용
 */

export interface QuizItem {
  no: number;
  kind: "real" | "fake";
  real?: Apartment;
  fake?: FakeName;
}

// 날짜·회차 계산은 lib/episode.ts에 있다 (출제 풀을 안 끌고 오는 순수 함수).
// 여기서 다시 내보내 기존 호출부는 그대로 둔다
export { kstDateString, episodeNumber } from "./episode";

export function pickByDifficulty<T extends { difficulty: Difficulty }>(
  pool: T[],
  want: Difficulty,
  rng: () => number,
  used: Set<T>,
  weight?: Map<T, number>,
): T {
  const order: Difficulty[][] = {
    easy: [["easy"], ["mid"], ["hard"]],
    mid: [["mid"], ["easy"], ["hard"]],
    hard: [["hard"], ["mid"], ["easy"]],
  }[want] as Difficulty[][];
  for (const tier of order) {
    const candidates = pool.filter((p) => tier.includes(p.difficulty) && !used.has(p));
    if (candidates.length) {
      const chosen = weight ? weightedPick(candidates, weight, rng) : candidates[Math.floor(rng() * candidates.length)];
      used.add(chosen);
      return chosen;
    }
  }
  throw new Error("출제 풀 부족: 시드 데이터를 확인하세요");
}

/** 무게(lib/balance.ts의 겉모양 무게)에 비례해 하나 */
function weightedPick<T>(list: T[], weight: Map<T, number>, rng: () => number): T {
  const total = list.reduce((s, t) => s + (weight.get(t) ?? 1), 0);
  let r = rng() * total;
  for (const t of list) if ((r -= weight.get(t) ?? 1) <= 0) return t;
  return list[list.length - 1];
}

/**
 * 공식전에 겉모양 무게를 쓰기 시작한 날(KST). 공식전은 (날짜, 구역)으로 정해진 문제라
 * 그날 도중에 뽑는 법을 바꾸면 이미 치고 있던 사람의 문제가 바뀐다. 다음 날부터 적용한다
 */
export const BALANCE_FROM = "2026-10-12";
export const balanced = (date: string) => date >= BALANCE_FROM;

/** 난이도 커브: 위치별 목표 난이도 (docs/02) */
const CURVE: Difficulty[] = ["easy", "easy", "mid", "mid", "mid", "mid", "mid", "hard", "hard", "hard"];

/**
 * 그날 그 구역의 10문제.
 * area가 없으면 전국 공식전. 구역을 주면 그 구역 단지·말투로만 낸다.
 * 같은 (날짜, 구역)이면 누가 열어도 같은 문제 — 그래야 순위를 비교할 수 있다.
 */
export function quizForDate(date: string, area?: string | null): QuizItem[] {
  const { reals, fakes, realW, fakeW } = poolOf(area);
  const rng = rngForDate(date, 0, area);
  const on = balanced(date);

  const realCount = 4 + Math.floor(rng() * 3); // 4~6
  const kinds = seededShuffle(
    [...Array(realCount).fill("real"), ...Array(10 - realCount).fill("fake")] as ("real" | "fake")[],
    rng,
  );

  const usedReal = new Set<Apartment>();
  const usedFake = new Set<FakeName>();

  return kinds.map((kind, idx) => {
    const want = CURVE[idx];
    if (kind === "real") {
      return { no: idx + 1, kind, real: pickByDifficulty(reals, want, rng, usedReal, on ? realW : undefined) };
    }
    return { no: idx + 1, kind, fake: pickByDifficulty(fakes, want, rng, usedFake, on ? fakeW : undefined) };
  });
}

export function itemName(item: QuizItem): string {
  return item.kind === "real" ? item.real!.name : item.fake!.name;
}
