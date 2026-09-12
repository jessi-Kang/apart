/**
 * 운영 현황의 기간과 표 모양.
 *
 * opsstats.ts에서 갈라냈다. 거기는 첫 줄에 `@neondatabase/serverless`를
 * 부르는데, 화면이 기간 이름 하나 쓰겠다고 거기서 가져오니 DB 클라이언트가
 * 통째로 브라우저 번들에 실렸다(/ops 47.4kB, 다른 화면은 3~4kB).
 * 값만 있는 것과 DB를 여는 것은 파일을 나눈다.
 */

export const PERIODS = ["day", "week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
  day: "오늘",
  week: "최근 7일",
  month: "최근 30일",
  all: "전체",
};

/** 클라이언트가 보낸 값을 거른다 — 모르는 값은 오늘로 떨어뜨린다 */
export function toPeriod(v: unknown): Period {
  return PERIODS.includes(v as Period) ? (v as Period) : "day";
}

export interface ModeRow {
  mode: string;
  runs: number;
  questions: number;
  avgBest: number;
}
export interface OfficialRow {
  mode: string;
  entries: number;
  avgScore: number;
}
export interface OpsStats {
  period: Period;
  from: string | null;
  today: string;
  endless: ModeRow[];
  official: OfficialRow[];
  users: { joined: number; total: number; withRecord: number };
  bugs: { total: number; awarded: number };
  areas: { area: string; entries: number }[];
}
