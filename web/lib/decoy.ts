import { assemblePoolOf } from "./data";
import { PIECE_FEATURES, rake } from "./balance";

/**
 * 이름 조립의 미끼 조각.
 *
 * 처음에는 같은 구역 가짜 이름의 토큰만 미끼로 썼다. 그런데 정답 조각은 실단지명을 쪼갠
 * 것이라 "2단지"·"…아파트"·한두 글자 조각이 흔하고, 가짜 토큰에는 그런 것이 거의 없었다.
 * 주간 점검에서 숫자가 든 조각은 정답이라고 찍으면 공식전 94.4%(구역에 따라 100%)였고,
 * 무한은 길이를 자르지 않아 5자 넘는 조각이면 미끼였다.
 *
 * 그래서 미끼 후보에 **같은 범위 다른 실단지의 조각**을 더하고(정답과 같은 말투가 생긴다),
 * 후보마다 정답 조각의 모양 분포로 끌어오는 무게를 매긴다(lib/balance.ts와 같은 반복 비례
 * 조정, 무게 0.25~4). 정답 조각 자체는 바꿀 수 없으니 미끼 쪽만 끈다.
 *
 * 길이는 정답 조각의 95%가 드는 길이까지로 자른다. 붙여 쓴 긴 가짜가 통째로 조각 하나가
 * 되면 칩이 격자를 밀어내 320x568에서 주 동작이 잘렸다.
 */

export interface DecoyPool {
  tokens: string[];
  weight: Map<string, number>;
}

const cache = new Map<string, DecoyPool>();
const hasLetter = (t: string) => /[가-힣A-Za-z]/.test(t);

export function decoyPoolOf(area?: string | null): DecoyPool {
  const pool = assemblePoolOf(area);
  const key = pool.sido ?? "";
  const hit = cache.get(key);
  if (hit) return hit;
  const answerPieces = pool.reals.flatMap((a) => a.name.split(" ")).filter(Boolean);
  const lens = answerPieces.map((p) => p.length).sort((a, b) => a - b);
  const maxLen = lens[Math.floor(lens.length * 0.95)] ?? 6;
  const tokens = [
    ...new Set([...pool.fakes.flatMap((f) => f.name.split(" ")), ...answerPieces]),
  ].filter((t) => t && hasLetter(t) && t.length <= maxLen);
  const share = (list: string[], f: (p: string) => boolean) => list.filter(f).length / (list.length || 1);
  const target = PIECE_FEATURES.map(([, f]) => share(answerPieces, f));
  const w = rake(tokens.map((t) => PIECE_FEATURES.map(([, f]) => f(t))), target);
  const out = { tokens, weight: new Map(tokens.map((t, i) => [t, w[i]])) };
  cache.set(key, out);
  return out;
}

/**
 * 정답 조각과 번호만 다른 조각("2단지"에 "3단지")은 미끼로 쓰지 않는다. 힌트(위치·준공년도·
 * 세대수)로는 몇 단지인지 가릴 수 없어서 추리가 아니라 찍기가 된다.
 */
export function usableDecoys(tokens: string[], answer: string[]): string[] {
  const bare = (t: string) => t.replace(/\d+/g, "#");
  const twins = new Set(answer.filter((a) => /\d/.test(a)).map(bare));
  return tokens.filter((t) => !answer.includes(t) && !(/\d/.test(t) && twins.has(bare(t))));
}
