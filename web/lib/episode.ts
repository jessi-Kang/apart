/**
 * 날짜와 회차 계산.
 *
 * daily.ts에 있었는데 그 파일은 출제 풀(단지 7,532건)을 불러온다. 화면 쪽에서
 * 회차 번호 하나 쓰자고 가져오면 그 덩어리가 통째로 클라이언트 번들에 실린다.
 * 계산은 날짜만 있으면 되는 순수 함수라 따로 뺀다.
 */

export function kstDateString(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 서비스 회차 번호 (에피소드). 기준일로부터 경과일 + 1 */
const EPOCH = Date.UTC(2026, 8, 10); // 2026-09-10 = 제1호
export function episodeNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.max(1, Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1);
}
