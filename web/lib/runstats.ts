import { neon } from "@neondatabase/serverless";

/**
 * 무한 판(세션) 익명 집계 — 메트로 타이핑식 판 단위 경쟁.
 * 세션이 끝날 때 최고 연속을 기록하고, 최근 7일 같은 모드의 판들과
 * 비교한 백분위를 돌려준다. 로그인 불필요, 표본 미달이면 null.
 * stats.ts와 같은 원칙: DB 오류는 게임을 막지 않는다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const RUN_MODES = ["ox", "assemble", "findreal"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export interface RunResult {
  best: number;
  hits: number;
  count: number;
  avgMs: number | null;
}

/** 판 기록 저장 + 최근 7일 대비 상위 % (표본 미달이면 top=null) */
export async function recordEndlessRun(
  mode: RunMode,
  date: string,
  run: RunResult,
  minSample = 20,
): Promise<{ top: number | null; sample: number }> {
  if (!sql) return { top: null, sample: 0 };
  try {
    await sql`
      INSERT INTO endless_runs (mode, date, best, hits, cnt, avg_ms)
      VALUES (${mode}, ${date}, ${run.best}, ${run.hits}, ${run.count}, ${run.avgMs})`;
    const rows = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE best > ${run.best})::int AS better
      FROM endless_runs
      WHERE mode = ${mode} AND created_at > now() - interval '7 days'`) as {
      total: number;
      better: number;
    }[];
    const { total, better } = rows[0] ?? { total: 0, better: 0 };
    if (total < minSample) return { top: null, sample: total };
    return { top: Math.max(1, Math.round(((better + 1) / total) * 100)), sample: total };
  } catch {
    return { top: null, sample: 0 };
  }
}

/** 저장 없이 순위만 본다 (기록 열람실). 표본 미달이면 top=null */
export async function rankAmongRuns(
  mode: RunMode,
  best: number,
  minSample = 20,
): Promise<{ top: number | null; sample: number }> {
  if (!sql) return { top: null, sample: 0 };
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE best > ${best})::int AS better
      FROM endless_runs
      WHERE mode = ${mode} AND created_at > now() - interval '7 days'`) as {
      total: number;
      better: number;
    }[];
    const { total, better } = rows[0] ?? { total: 0, better: 0 };
    if (total < minSample) return { top: null, sample: total };
    return { top: Math.max(1, Math.round(((better + 1) / total) * 100)), sample: total };
  } catch {
    return { top: null, sample: 0 };
  }
}
