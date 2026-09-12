/**
 * 점수 규칙 한 곳.
 *
 * 전에는 세 창구가 저마다 점수를 매겼고(감별 정답 10, 조립 10+속도, 찾기 정답 10),
 * 감별 O/X와 진짜 찾기는 시간을 아예 안 봤다. 그러면 두 가지가 무너진다.
 *  1) 창구 난이도가 점수에 안 드러난다. 2지선다는 찍어도 절반이 맞는데
 *     4지선다·조립과 같은 10점이었다.
 *  2) 변별력이 사라진다. 점수가 10점 단위로만 움직이니 열심히 한 사람과
 *     대충 한 사람이 같은 칸에 쌓이고, 명부에 동점이 줄줄이 생긴다.
 *
 * 그래서 모든 창구에 같은 뼈대를 쓴다:
 *   문제 점수 = 기본 점수 + 남은 시간 보너스 − 힌트 감점
 * 기본 점수는 찍어서 맞을 확률의 역순이고(2지선다 < 4지선다 < 조립),
 * 보너스는 남은 시간에 비례해 1점 단위로 갈린다. 같은 10문제를 다 맞혀도
 * 빨리 푼 사람이 위로 간다.
 */

export type GameKey = "ox" | "assemble" | "findreal";

/** 창구별 제한 시간(초). 화면의 TIME_LIMIT과 같은 값이어야 한다 */
export const TIME_LIMIT: Record<GameKey, number> = { ox: 12, findreal: 15, assemble: 40 };

interface Rule {
  /** 맞히면 기본으로 주는 점수 */
  base: number;
  /** 남은 시간을 다 쓰지 않았을 때 얹어 주는 최대 점수 */
  speed: number;
  /** 초성 힌트 한 단계당 깎는 점수 */
  hintCost: number;
}

/**
 * 기본 점수는 "찍어서 맞을 확률"의 반대로 둔다.
 * 감별 O/X는 둘 중 하나(50%), 진짜 찾기는 넷 중 하나(25%),
 * 조립은 찍어서 맞을 수가 없다.
 */
const RULES: Record<GameKey, Rule> = {
  ox: { base: 6, speed: 6, hintCost: 0 },
  findreal: { base: 9, speed: 7, hintCost: 0 },
  assemble: { base: 12, speed: 10, hintCost: 4 },
};

/** 무한은 문제 수에 상한이 없다. 같은 값을 주면 오래 앉아 있는 것이 곧 순위가 된다 */
const ENDLESS_RATE = 0.7;

/** 공식전을 끝까지 치른 값 — 창구와 무관하게 완주 자체에 주는 점수 */
export const FINISH_BONUS = 20;
/** 무한에서 역대 최고 연속을 새로 쓴 값 */
export const RECORD_BONUS = 30;

export interface QuestionInput {
  correct: boolean;
  /** 그 문제를 푸는 데 걸린 시간(ms) */
  elapsedMs: number;
  /** 조립에서 받은 초성 힌트 단계 */
  hintTier?: number;
  /** 무한에서 이 문제를 맞힌 시점의 연속 수 (1이면 첫 적중) */
  run?: number;
  /** 무한인가 */
  endless?: boolean;
}

/**
 * 문제 하나의 점수. 틀리면 0이다.
 * 시간을 다 쓴 정답도 기본 점수는 받는다 — 오래 고민해서 맞힌 것도 맞힌 것이다.
 */
export function questionScore(game: GameKey, input: QuestionInput): number {
  if (!input.correct) return 0;
  const rule = RULES[game];
  const limit = TIME_LIMIT[game] * 1000;
  const left = Math.max(0, Math.min(1, (limit - input.elapsedMs) / limit));
  let pts = rule.base + Math.round(rule.speed * left);
  if (rule.hintCost && input.hintTier) pts -= rule.hintCost * input.hintTier;
  if (input.endless) {
    pts = Math.round(pts * ENDLESS_RATE);
    // 연속이 길어질수록 한 문제의 값이 오른다. 무한의 재미가 연속이라
    // 점수도 거기를 봐야 한다 (10에서 멈춘다 — 끝없이 불어나면 한 판이 모든 걸 정한다)
    pts += Math.min(input.run ?? 0, 10);
  }
  // 힌트를 다 받고 맞혀도 0점은 아니다. 맞힌 것은 맞힌 것이다
  return Math.max(1, pts);
}

/** 이 창구에서 한 문제로 받을 수 있는 가장 큰 점수 (화면 안내용) */
export function maxQuestionScore(game: GameKey): number {
  return RULES[game].base + RULES[game].speed;
}
