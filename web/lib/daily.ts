import { apartments, fakeNames, type Apartment, type FakeName, type Difficulty } from "./data";
import { mulberry32, seededShuffle } from "./seeded";

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

export function kstDateString(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 서비스 회차 번호 (에피소드). 기준일로부터 경과일 + 1 */
const EPOCH = Date.UTC(2026, 8, 10); // 2026-09-10 = #1
export function episodeNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.max(1, Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1);
}

export function pickByDifficulty<T extends { difficulty: Difficulty }>(
  pool: T[],
  want: Difficulty,
  rng: () => number,
  used: Set<T>,
): T {
  const order: Difficulty[][] = {
    easy: [["easy"], ["mid"], ["hard"]],
    mid: [["mid"], ["easy"], ["hard"]],
    hard: [["hard"], ["mid"], ["easy"]],
  }[want] as Difficulty[][];
  for (const tier of order) {
    const candidates = pool.filter((p) => tier.includes(p.difficulty) && !used.has(p));
    if (candidates.length) {
      const chosen = candidates[Math.floor(rng() * candidates.length)];
      used.add(chosen);
      return chosen;
    }
  }
  throw new Error("출제 풀 부족: 시드 데이터를 확인하세요");
}

/** 난이도 커브: 위치별 목표 난이도 (docs/02) */
const CURVE: Difficulty[] = ["easy", "easy", "mid", "mid", "mid", "mid", "mid", "hard", "hard", "hard"];

export function quizForDate(date: string): QuizItem[] {
  const seed = Number(date.replaceAll("-", ""));
  const rng = mulberry32(seed);

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
      return { no: idx + 1, kind, real: pickByDifficulty(apartments, want, rng, usedReal) };
    }
    return { no: idx + 1, kind, fake: pickByDifficulty(fakeNames, want, rng, usedFake) };
  });
}

export function itemName(item: QuizItem): string {
  return item.kind === "real" ? item.real!.name : item.fake!.name;
}
