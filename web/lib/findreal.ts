import { poolOf, type Apartment, type FakeName, type Difficulty } from "./data";
import { pickByDifficulty } from "./daily";
import { seededShuffle, rngForDate } from "./seeded";

/**
 * 진짜 찾기 4지선다 출제 (docs/06 모드 3)
 * - 4개 중 진짜는 하나, 나머지 셋은 같은 난이도의 가짜
 * - 매일 10라운드, 난이도 커브는 본편과 동일 (쉬움 2 → 중간 5 → 어려움 3)
 * - 연속 적중 콤보는 날짜를 넘어 이어지는 기록 갱신형 루프 (클라이언트 보관)
 * - 본편·조립과 같은 날짜 시드, 오프셋으로 분리
 */

export interface FindRealRound {
  no: number;
  options: string[]; // 섞인 4개. 어느 것이 진짜인지는 포함하지 않는다
}

const SEED_OFFSET = 555_000_000;
const ROUND_DIFF: Difficulty[] = ["easy", "easy", "mid", "mid", "mid", "mid", "mid", "hard", "hard", "hard"];

interface InternalRound {
  real: Apartment;
  fakes: FakeName[];
  options: string[];
}

function roundsForDate(date: string, area?: string | null): InternalRound[] {
  const { reals, fakes: fakePool } = poolOf(area);
  const rng = rngForDate(date, SEED_OFFSET, area);
  const usedReal = new Set<Apartment>();
  const usedFake = new Set<FakeName>();
  return ROUND_DIFF.map((want) => {
    const real = pickByDifficulty(reals, want, rng, usedReal);
    const fakes = [0, 1, 2].map(() => pickByDifficulty(fakePool, want, rng, usedFake));
    const options = seededShuffle([real.name, ...fakes.map((f) => f.name)], rng);
    return { real, fakes, options };
  });
}

export function findRealForDate(date: string, area?: string | null): FindRealRound[] {
  return roundsForDate(date, area).map((r, idx) => ({ no: idx + 1, options: r.options }));
}

/** 서버 판정: 고른 이름이 진짜인지. 오답이어도 진짜와 메타를 공개한다.
 * pick=null은 시간 초과 — 오답 처리하되 정답은 공개한다 */
export function checkFindReal(
  date: string,
  no: number,
  pick: string | null,
  area?: string | null,
): { correct: boolean; answer: string; meta: { location: string; builtYear: number; households: number } } | null {
  const round = roundsForDate(date, area)[no - 1];
  if (!round || (pick !== null && !round.options.includes(pick))) return null;
  const r = round.real;
  return {
    correct: pick === r.name,
    answer: r.name,
    meta: {
      location: `${r.sido} ${r.sigungu} ${r.dong}`,
      builtYear: r.builtYear,
      households: r.households,
    },
  };
}
