import { mulberry32 } from "./seeded";

/** 한글 초성 유틸 (조립 힌트용, 서버 전용) */

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

function choOf(ch: string): string {
  const code = ch.charCodeAt(0) - 0xac00;
  // 한글이 아닌 글자(숫자·영문)는 그대로 노출한다
  return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 정답 이름의 초성 힌트 마스크.
 * 앞에서부터 몰아서 열면 첫 조각이 통째로 공개돼 버리므로,
 * 티어가 오를 때마다 "조각(토큰) 하나당 랜덤 위치 한 글자"씩 연다.
 * 공개 위치는 시드로 고정 — 티어가 올라도 이미 열린 자리는 그대로다.
 *
 * filled: 사용자가 이미 채워 둔 칸. 빈 칸을 먼저 열되, 그것만으로 tier에
 * 모자라면 채운 칸도 연다.
 * 사람은 왼쪽부터 채우는데 힌트도 왼쪽부터 열리니, 힌트가 매번 이미 푼
 * 자리에 떨어져 "힌트가 안 나온다"로 보였다. 그렇다고 채운 칸을 영영
 * 빼 두면 제한 시간이 다 가도록 못 받는 힌트가 생긴다. 시간이 지나면
 * 받을 몫은 다 받아야 하므로, 순서만 빈 칸을 앞세우고 수는 tier개 그대로 둔다.
 */
export function choseongHint(name: string, tier: number, seedKey: string, filled: number[] = []): string {
  const rng = mulberry32(seedOf(seedKey));
  const tokens = name.split(" ");
  const revealAt = tokens.map((t) => Math.floor(rng() * t.length));
  const skip = new Set(filled);
  const open = new Set<number>();
  // 1순위: 아직 안 채운 칸 (지금 도움이 되는 자리)
  for (let ti = 0; ti < tokens.length && open.size < tier; ti++) {
    if (!skip.has(ti)) open.add(ti);
  }
  // 2순위: 그래도 모자라면 채운 칸도 연다. 받을 몫을 시간 안에 다 주기 위해서다
  for (let ti = 0; ti < tokens.length && open.size < tier; ti++) open.add(ti);
  return tokens
    .map((t, ti) =>
      [...t].map((ch, ci) => (open.has(ti) && ci === revealAt[ti] ? choOf(ch) : "○")).join(""),
    )
    .join(" ");
}

/** 쿼리로 들어온 "0,2" 꼴을 칸 번호 배열로. 믿을 수 없는 입력이라 걸러 낸다 */
export function parseFilled(raw: string | null): number[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((x) => Number(x)))]
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 12)
    .slice(0, 12);
}

