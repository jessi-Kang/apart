/**
 * 지은 이름이 지금 어느 단계에 있나.
 *
 * 승인과 출제는 다른 단계다. 승인은 "출제해도 되는 이름"이라는 표시일 뿐이고,
 * 실제로 문제로 나오려면 정적 풀에 내보내는 걸음이 하나 더 있다
 * (`npm run export-coined`). 화면이 이 둘을 뭉뚱그리면 승인되자마자 문제로
 * 나온 줄 알고 속은 수가 0인 것을 이상하게 여긴다.
 *
 * DB도 화면도 모르는 순수 함수다 — 서버(`/api/coined/mine`)와 화면 둘 다
 * 같은 말을 쓰게 하려고 갈라 뒀다.
 */

export interface CoinState {
  approved: boolean;
  rejected: boolean;
  /** 출제 풀에 실제로 올라갔는가 */
  live: boolean;
  /** 감별 창구에 걸린 횟수 */
  shown: number;
}

export function coinStage(c: CoinState): string {
  if (c.rejected) return "반려";
  if (c.live) return c.shown > 0 ? "출제 중" : "출제 중 · 아직 안 나왔습니다";
  if (c.approved) return "출제 대기";
  return "검토 중";
}
