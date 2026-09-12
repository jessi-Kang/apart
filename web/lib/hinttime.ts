/**
 * 이름 조립의 초성 힌트 시간표.
 *
 * 전에는 15·25·33초 세 번으로 박아 뒀다. 칸이 셋일 때만 맞는 시간표다 —
 * 칸이 둘이면 33초 것은 열 게 없어 아무 일도 일어나지 않고, 넷이면 제한
 * 시간(40초) 안에 한 칸은 끝내 안 열린다. 칸 수는 단지 이름마다 다르므로
 * 시간표도 칸 수를 따라간다.
 *
 * 규칙: 첫 힌트는 늘 15초(그 전은 스스로 풀어 보는 시간), 마지막 힌트는
 * 33초(제한 시간 40초 전에 다 받고 답을 넣을 틈이 남는다). 그 사이를
 * 칸 수만큼 고르게 나눈다.
 */

export const HINT_FIRST = 15;
export const HINT_LAST = 33;

/** 칸 수에 맞춘 힌트 공개 시각(초). i번째 힌트는 초성을 i개까지 연다 */
export function hintTimes(slots: number): number[] {
  const n = Math.max(1, Math.floor(slots));
  if (n === 1) return [HINT_FIRST];
  const span = HINT_LAST - HINT_FIRST;
  return Array.from({ length: n }, (_, i) => Math.round(HINT_FIRST + (span * i) / (n - 1)));
}

/** 화면에 적는 안내 — 칸이 많으면 다 늘어놓지 않고 범위로 줄인다 */
export function hintTimeNote(slots: number): string {
  const t = hintTimes(slots);
  if (t.length <= 4) return `${t.map((s) => `${s}초`).join(" · ")}에 초성이 한 글자씩 열립니다`;
  return `${HINT_FIRST}초부터 ${HINT_LAST}초까지 ${t.length}번에 걸쳐 초성이 한 글자씩 열립니다`;
}
