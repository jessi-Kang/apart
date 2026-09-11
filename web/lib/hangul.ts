/** 한글 초성 유틸 (조립 힌트용, 서버 전용) */

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

/**
 * 정답 이름의 초성 마스크. 앞에서부터 reveal글자만 초성을 보여주고
 * 나머지는 ○로 가린다 (공백은 그대로 유지 — 토큰 구조도 힌트다).
 * 한글이 아닌 글자(숫자·영문)는 공개 구간에서 그대로 노출한다.
 */
export function choseongMask(name: string, reveal: number): string {
  let shown = 0;
  return [...name]
    .map((ch) => {
      if (ch === " ") return " ";
      if (shown >= reveal) return "○";
      shown++;
      const code = ch.charCodeAt(0) - 0xac00;
      return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
    })
    .join("");
}
