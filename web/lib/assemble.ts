import { assemblePoolOf, type Apartment } from "./data";
import { choseongHint } from "./hangul";
import { seededShuffle, rngForDate as rngForDateWithOffset } from "./seeded";

/**
 * 이름 조립 모드 출제 (docs/06 모드 2)
 * - 힌트(위치·준공년도·세대수)를 보고 조각으로 실존 단지명을 조립
 * - 매일 10문제, 본편과 같은 KST 날짜 시드 (시드 오프셋으로 본편과 분리)
 * - 함정 조각은 가짜 이름 풀의 토큰 재활용 (docs/06: 기존 데이터만으로 출제)
 */

export interface AssemblePuzzle {
  no: number;
  pieces: string[]; // 정답 토큰 + 함정, 섞인 상태
  answerLen: number;
  hint: { location: string; builtYear: number; households: number };
}

const SEED_OFFSET = 777_000_000; // 본편 시드와 절대 겹치지 않게

function rngForDate(date: string, area?: string | null) {
  return rngForDateWithOffset(date, SEED_OFFSET, area);
}

/** 그날 그 구역의 정답 단지 10개 (조각 2개 이상으로 쪼개지는 이름만) */
function answersForDate(date: string, area?: string | null): Apartment[] {
  const rng = rngForDate(date, area);
  return seededShuffle(assemblePoolOf(area).reals, rng).slice(0, 10);
}

/** 함정 조각 풀: 같은 구역 가짜 이름의 토큰 (중복 제거) */
function decoyPool(area?: string | null): string[] {
  return [...new Set(assemblePoolOf(area).fakes.flatMap((f) => f.name.split(" ")))];
}

export function assembleForDate(date: string, area?: string | null): AssemblePuzzle[] {
  const rng = rngForDate(date, area);
  const DECOY_POOL = decoyPool(area);
  return answersForDate(date, area).map((apt, idx) => {
    const answer = apt.name.split(" ");
    const decoys = seededShuffle(
      DECOY_POOL.filter((t) => !answer.includes(t)),
      rng,
    ).slice(0, answer.length >= 3 ? 2 : 3);
    return {
      no: idx + 1,
      pieces: seededShuffle([...answer, ...decoys], rng),
      answerLen: answer.length,
      hint: {
        location: `${apt.sido} ${apt.sigungu} ${apt.dong}`,
        builtYear: apt.builtYear,
        households: apt.households,
      },
    };
  });
}

/** 시간 경과 초성 힌트: tier가 오를 때마다 조각 하나당 랜덤 한 글자씩 연다 */
export function assembleHint(date: string, no: number, tier: number, area?: string | null): { mask: string } | null {
  const target = answersForDate(date, area)[no - 1];
  if (!target || !Number.isInteger(tier) || tier < 1) return null;
  return { mask: choseongHint(target.name, Math.min(tier, 3), `${date}#${no}`) };
}

/** 서버 판정: 조립 결과 대조. 오답이어도 정답과 메타를 공개한다 (열람 학습 루프) */
export function checkAssemble(
  date: string,
  no: number,
  guess: string[],
  area?: string | null,
): { correct: boolean; answer: string; meta: AssemblePuzzle["hint"] } | null {
  const target = answersForDate(date, area)[no - 1];
  if (!target) return null;
  return {
    correct: guess.join(" ") === target.name,
    answer: target.name,
    meta: {
      location: `${target.sido} ${target.sigungu} ${target.dong}`,
      builtYear: target.builtYear,
      households: target.households,
    },
  };
}
