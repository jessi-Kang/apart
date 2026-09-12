/**
 * 힌트 마스크 다루기 (서버·클라이언트 공용).
 *
 * 정답을 아는 쪽(lib/hangul.ts)과 분리해 둔다. 화면이 정답 모듈에서
 * 뭔가를 가져오기 시작하면 "정답은 클라이언트에 내려주지 않는다"는 선이
 * 흐려진다. 여기 있는 것은 ○과 글자로 된 문자열을 다루는 일뿐이다.
 */
/**
 * 힌트 마스크 두 장을 합친다. 한쪽이라도 연 글자는 열린 채로 남는다.
 *
 * 조각을 비웠다 채웠다 하면 그때그때 여는 자리가 달라진다. 그때 새 마스크로
 * 덮어써 버리면 방금까지 보이던 초성이 사라진다 — 이미 받은 힌트를 도로
 * 가져가는 셈이다. 그래서 덮지 않고 더한다.
 */
export function mergeMask(prev: string | null, next: string): string {
  if (!prev || prev.length !== next.length) return next;
  return [...next].map((ch, i) => (ch === "○" ? prev[i] : ch)).join("");
}
