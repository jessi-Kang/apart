/**
 * 작명 규칙의 숫자.
 *
 * coined.ts에서 갈라냈다. 그 파일 첫 줄이 `@neondatabase/serverless`라,
 * 화면이 점수 하나 쓰겠다고 거기서 가져오면 DB 클라이언트가 통째로 브라우저
 * 번들에 실린다(/ops에서 한 번 겪었다. 47.4kB → 3.41kB).
 */

/** 작명 한 건에 주는 점수. 감별 한 문제 값이다 — 고맙다는 표시지 벌이가 아니다 */
export const COIN_POINTS = 12;
/** 하루에 점수를 받을 수 있는 작명 수 */
export const AWARD_PER_DAY = 5;
