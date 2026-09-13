/**
 * 작명 호칭.
 *
 * 감별 직급(lib/level.ts)과 **갈라 둔다**. 합치면 이름을 많이 지은 사람이
 * 감별 직급으로 올라가고, 직급은 구역 명부 순위의 기준이라 감별 실력 순위가
 * 작명으로 오염된다. 잘 가려내는 일과 잘 속이는 일은 다른 재주다.
 *
 * 점수는 두 갈래로 들어온다.
 *   접수    한 건에 COIN_POINTS. 지어 준 값이다
 *   속임    그 이름이 감별 창구에서 한 명 속일 때마다 1점
 * 작명소 첫 화면이 "많이 속인 이름을 지은 사람에게 호칭이 붙는다"고 말하므로,
 * 접수만 쌓아서는 위로 못 올라가게 속임 쪽을 열어 둔다.
 *
 * DB를 모른다 — 화면이 이 파일 하나만 가져와도 브라우저 번들이 붇지 않는다
 * (coinrule.ts와 같은 이유).
 */

import { COIN_POINTS } from "./coinrule";

/** 한 명 속일 때마다 붙는 점수 */
export const FOOL_POINT = 1;

/** 접수한 이름 수와 속인 횟수로 매기는 작명 점수 */
export function coinScore(accepted: number, fooled: number): number {
  return Math.max(0, Math.round(accepted)) * COIN_POINTS + Math.max(0, Math.round(fooled)) * FOOL_POINT;
}

/**
 * 호칭 사다리. 감별 직급과 말이 겹치지 않게 골랐다 —
 * 두 사다리의 이름이 비슷하면 어느 쪽 호칭인지 화면에서 구별이 안 된다.
 */
const COIN_TITLES: [number, string][] = [
  [0, "작명 지망생"],
  [24, "작명 서기"],
  [60, "작명 주사"],
  [144, "작명 사무관"],
  [300, "작명 서기관"],
  [600, "이름 장인"],
  [1200, "이름 명장"],
];

export interface CoinLevel {
  score: number;
  title: string;
  /** 다음 호칭과 남은 점수. 꼭대기면 null */
  next: { title: string; left: number } | null;
}

export function coinLevel(score: number): CoinLevel {
  const s = Math.max(0, Math.round(score));
  let title = COIN_TITLES[0][1];
  let next: CoinLevel["next"] = null;
  for (const [min, name] of COIN_TITLES) {
    if (s >= min) title = name;
    else {
      next = { title: name, left: min - s };
      break;
    }
  }
  return { score: s, title, next };
}
