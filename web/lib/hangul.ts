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
 */
export function choseongHint(name: string, tier: number, seedKey: string): string {
  const rng = mulberry32(seedOf(seedKey));
  const tokens = name.split(" ");
  const revealAt = tokens.map((t) => Math.floor(rng() * t.length));
  const openTokens = Math.min(tier, tokens.length);
  return tokens
    .map((t, ti) =>
      [...t].map((ch, ci) => (ti < openTokens && ci === revealAt[ti] ? choOf(ch) : "○")).join(""),
    )
    .join(" ");
}
