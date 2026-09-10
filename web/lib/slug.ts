/** 공유 결과 슬러그: {date}-{score}-{grid} 예) 2026-09-10-8-1101110111 */

export interface ResultSlug {
  date: string;
  score: number;
  marks: boolean[];
}

export function buildSlug(date: string, marks: boolean[]): string {
  const score = marks.filter(Boolean).length;
  return `${date}-${score}-${marks.map((m) => (m ? "1" : "0")).join("")}`;
}

export function parseSlug(slug: string): ResultSlug | null {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{1,2})-([01]{10})$/.exec(slug);
  if (!m) return null;
  const score = Number(m[2]);
  const marks = m[3].split("").map((c) => c === "1");
  if (score !== marks.filter(Boolean).length || score > 10) return null;
  return { date: m[1], score, marks };
}
