/**
 * 겉모양 맞추기 — 구역마다 진짜와 가짜가 같은 모양으로 나오게 출제 무게를 매긴다.
 *
 * 가짜 생성기(scripts/generate-fakes.mjs)는 전국 실단지의 모양(띄어쓰기·글자 수·
 * 끝 낱말)을 배워 짓는다. 그래서 전국으로 치면 모양만 보고 못 찍는데, 구역을 고르면
 * 찍을 수 있었다. 충북 실단지는 67%가 "…아파트"로 끝나는데 그 구역에서 나가는 가짜는
 * 18%라서, "아파트"로 끝나면 진짜로 찍어 78%를 맞혔다(주간 점검 첫 회, 21곳).
 *
 * 가짜를 구역마다 따로 지으면 지역색 없는 가짜(대부분)가 모든 구역에 같이 나가므로
 * 한 구역에 맞추면 다른 구역이 어긋난다. 그래서 풀은 그대로 두고 **뽑는 무게**를
 * 바꾼다. 두 분포의 가운데를 목표로 진짜·가짜 양쪽을 끌어온다 — 한쪽만 끌면 그쪽
 * 무게가 극단으로 가서 몇 안 되는 이름만 되풀이된다(가짜는 구역마다 400~800건뿐이다).
 *
 * 맞추는 특징은 /qa 겉모양 검사와 같은 일곱 가지다. 칸을 곱해 나누면 칸이 비어
 * 맞출 수 없어서, 특징마다 비율을 번갈아 맞추는 반복 비례 조정(raking)으로 맞춘다.
 * 무게는 0.25~4로 묶는다 — 더 벌리면 드문 이름 몇 개가 매판 나온다.
 */

const bare = (n: string) => n.replace(/\s+/g, "");

/** /qa·주간 점검과 같은 잣대 */
export const SHAPE_FEATURES: [string, (n: string) => boolean][] = [
  ["띄어쓰기 있음", (n) => /\s/.test(n)],
  ["6자 이하", (n) => bare(n).length <= 6],
  ["11자 이상", (n) => bare(n).length >= 11],
  ['"아파트"로 끝', (n) => bare(n).endsWith("아파트")],
  ['"마을"로 끝', (n) => bare(n).endsWith("마을")],
  ['"타운"으로 끝', (n) => bare(n).endsWith("타운")],
  ['"맨션"으로 끝', (n) => bare(n).endsWith("맨션")],
];

const MIN_W = 0.25;
const MAX_W = 4;

/** 이름마다 무게. 평균 1 */
export function rake(feats: boolean[][], target: number[]): number[] {
  const n = feats.length;
  const w = new Array<number>(n).fill(1);
  if (!n) return w;
  for (let iter = 0; iter < 40; iter++) {
    for (let f = 0; f < target.length; f++) {
      let on = 0, all = 0;
      for (let i = 0; i < n; i++) {
        all += w[i];
        if (feats[i][f]) on += w[i];
      }
      const have = on / all;
      const want = target[f];
      // 그 특징을 가진 이름이 아예 없거나 전부면 맞출 수 없다
      if (have <= 0 || have >= 1) continue;
      const up = want / have;
      const down = (1 - want) / (1 - have);
      for (let i = 0; i < n; i++) w[i] = Math.min(MAX_W, Math.max(MIN_W, w[i] * (feats[i][f] ? up : down)));
    }
  }
  const mean = w.reduce((s, x) => s + x, 0) / n;
  return w.map((x) => x / mean);
}

const share = (feats: boolean[][], f: number) => feats.filter((x) => x[f]).length / (feats.length || 1);

/** 진짜·가짜 각각의 이름별 출제 무게 */
export function shapeWeights(reals: { name: string }[], fakes: { name: string }[]): { real: number[]; fake: number[] } {
  const rf = reals.map((r) => SHAPE_FEATURES.map(([, t]) => t(r.name)));
  const ff = fakes.map((r) => SHAPE_FEATURES.map(([, t]) => t(r.name)));
  const target = SHAPE_FEATURES.map((_, f) => (share(rf, f) + share(ff, f)) / 2);
  return { real: rake(rf, target), fake: rake(ff, target) };
}

/**
 * 조립 조각의 겉모양. 미끼 조각이 이 특징들로 정답 조각과 갈리면 퍼즐이 반쯤 풀린 채 나간다
 * (주간 점검 첫 회: 숫자가 든 조각은 정답이라고 찍으면 공식전 94.4%). 주간 점검과 같은 잣대다.
 */
export const PIECE_FEATURES: [string, (p: string) => boolean][] = [
  ["1~2자", (p) => p.length <= 2],
  ["5자 이상", (p) => p.length >= 5],
  ["영문 포함", (p) => /[A-Za-z]/.test(p)],
  ["숫자 포함", (p) => /\d/.test(p)],
  ['"아파트"로 끝', (p) => p.endsWith("아파트")],
  ['"마을"·"타운"으로 끝', (p) => /(마을|타운)$/.test(p)],
  ['"단지"로 끝', (p) => p.endsWith("단지")],
];
