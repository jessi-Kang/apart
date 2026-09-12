import { neon } from "@neondatabase/serverless";

/**
 * 이름별 감별 집계.
 *
 * 어떤 이름에 사람들이 잘 속는지를 쌓는다. 문제 번호별 정답률(question_stats)로는
 * 답을 낼 수 없다 — 번호는 그날 그 구역의 자리일 뿐이고, 무한은 아예 번호가 없다.
 *
 * 이걸로 두 가지를 본다.
 *   진짜인데 AI라고 속은 이름  — 사람이 지었는데 AI처럼 보이는 이름
 *   AI인데 진짜라고 속은 이름  — AI가 지었는데 진짜처럼 보이는 이름
 * 둘 다 "요즘 아파트 이름이 어떻게 생겼나"를 말해 주는 재료다.
 *
 * 감별 O/X에서만 쌓는다. "이 이름을 보고 진짜/가짜를 물었을 때 몇 %가 속았나"라는
 * 뜻이 분명해서다. 4지선다는 나머지 셋에 따라 결과가 달라져 같은 잣대로 못 센다.
 *
 * 개인정보는 없다. 단지명과 지어낸 이름, 그리고 횟수뿐이다.
 * stats.ts와 같은 원칙 — DB가 없거나 실패해도 게임은 그대로 돌아간다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export type NameKind = "real" | "fake";

export interface NameRow {
  name: string;
  kind: NameKind;
  shown: number;
  fooled: number;
  /** 속은 비율 (0~1) */
  rate: number;
}

/**
 * 한 번의 감별을 기록한다.
 * @param fooled 속았는가 (진짜를 가짜라 했거나, 가짜를 진짜라 했거나)
 */
export async function recordName(name: string, kind: NameKind, fooled: boolean): Promise<void> {
  if (!sql || !name) return;
  try {
    await sql`
      INSERT INTO name_stats (name, kind, shown, fooled)
      VALUES (${name}, ${kind}, 1, ${fooled ? 1 : 0})
      ON CONFLICT (name, kind) DO UPDATE
      SET shown = name_stats.shown + 1,
          fooled = name_stats.fooled + ${fooled ? 1 : 0}`;
  } catch {
    /* 집계 실패는 게임을 막지 않는다 */
  }
}

/** 리포트가 열리는 최소 표본 — 이보다 적으면 비율이 우연에 좌우된다 */
export const MIN_SHOWN = 30;

/**
 * 가장 잘 속인 이름들.
 * @param kind real이면 "진짜인데 AI라고 속은", fake면 "AI인데 진짜라고 속은"
 */
export async function topFooling(kind: NameKind, limit = 20): Promise<NameRow[]> {
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT name, kind, shown, fooled
      FROM name_stats
      WHERE kind = ${kind} AND shown >= ${MIN_SHOWN}
      ORDER BY (fooled::float / shown) DESC, shown DESC
      LIMIT ${limit}`) as { name: string; kind: NameKind; shown: number; fooled: number }[];
    return rows.map((r) => ({ ...r, shown: Number(r.shown), fooled: Number(r.fooled), rate: Number(r.fooled) / Number(r.shown) }));
  } catch {
    return [];
  }
}

/** 표본이 문턱을 넘은 이름이 몇 개나 되는가 (리포트를 열지 말지 판단) */
export async function readyCount(): Promise<{ real: number; fake: number }> {
  if (!sql) return { real: 0, fake: 0 };
  try {
    const rows = (await sql`
      SELECT kind, COUNT(*)::int AS n
      FROM name_stats WHERE shown >= ${MIN_SHOWN}
      GROUP BY kind`) as { kind: NameKind; n: number }[];
    return {
      real: rows.find((r) => r.kind === "real")?.n ?? 0,
      fake: rows.find((r) => r.kind === "fake")?.n ?? 0,
    };
  } catch {
    return { real: 0, fake: 0 };
  }
}
