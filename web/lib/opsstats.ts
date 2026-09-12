import { neon } from "@neondatabase/serverless";
import { kstDateString } from "./episode";
import type { OpsStats, Period } from "./opsperiod";

export { PERIODS, PERIOD_LABEL, toPeriod } from "./opsperiod";
export type { Period, OpsStats, ModeRow, OfficialRow } from "./opsperiod";

/**
 * 운영 현황 — 운영자만 보는 전체 지표.
 *
 * 리포트(`/report`)는 "사람들이 어떤 이름에 속았나"를 보는 자리다. 그건
 * 콘텐츠 이야기고, 여기는 "서비스가 돌고 있나"를 보는 자리다. 한 화면에
 * 같이 두면 성격이 다른 표가 줄줄이 쌓여 무엇을 보러 온 화면인지 흐려진다.
 *
 * 날 경계는 게임과 같은 KST 날짜를 쓴다. question_stats·score_dist·
 * endless_runs가 모두 KST 날짜 문자열을 키로 갖고 있어서, 여기만 UTC로
 * 자르면 같은 하루를 두 가지로 세게 된다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/** 그 기간이 시작하는 KST 날짜. 전체면 null */
function since(period: Period): string | null {
  const days = period === "day" ? 0 : period === "week" ? 6 : period === "month" ? 29 : null;
  if (days === null) return null;
  const t = new Date(Date.now() + 9 * 3600 * 1000 - days * 86400 * 1000);
  return t.toISOString().slice(0, 10);
}

const empty = (period: Period): OpsStats => ({
  period,
  from: since(period),
  today: kstDateString(),
  endless: [],
  official: [],
  users: { joined: 0, total: 0, withRecord: 0 },
  bugs: { total: 0, awarded: 0 },
  areas: [],
});

export async function opsStats(period: Period): Promise<OpsStats> {
  const out = empty(period);
  if (!sql) return out;
  const from = out.from;
  // KST 자정을 timestamptz로 — created_at만 있는 표(app_user·bug_report)를 같은 경계로 자른다
  const fromTs = from ? `${from} 00:00:00+09` : null;
  try {
    const endless = (await (from
      ? sql`SELECT mode, COUNT(*)::int AS runs, COALESCE(SUM(cnt),0)::int AS q, COALESCE(AVG(best),0)::float AS avg_best
            FROM endless_runs WHERE date >= ${from} GROUP BY mode ORDER BY mode`
      : sql`SELECT mode, COUNT(*)::int AS runs, COALESCE(SUM(cnt),0)::int AS q, COALESCE(AVG(best),0)::float AS avg_best
            FROM endless_runs GROUP BY mode ORDER BY mode`)) as {
      mode: string;
      runs: number;
      q: number;
      avg_best: number;
    }[];
    out.endless = endless.map((r) => ({
      mode: r.mode,
      runs: r.runs,
      questions: r.q,
      avgBest: Math.round(r.avg_best * 10) / 10,
    }));

    const official = (await (from
      ? sql`SELECT mode, COALESCE(SUM(cnt),0)::int AS entries,
                   COALESCE(SUM(score*cnt)::float / NULLIF(SUM(cnt),0), 0)::float AS avg_score
            FROM score_dist WHERE date >= ${from} GROUP BY mode ORDER BY mode`
      : sql`SELECT mode, COALESCE(SUM(cnt),0)::int AS entries,
                   COALESCE(SUM(score*cnt)::float / NULLIF(SUM(cnt),0), 0)::float AS avg_score
            FROM score_dist GROUP BY mode ORDER BY mode`)) as {
      mode: string;
      entries: number;
      avg_score: number;
    }[];
    out.official = official.map((r) => ({
      mode: r.mode,
      entries: r.entries,
      avgScore: Math.round(r.avg_score * 10) / 10,
    }));

    // 구역별 공식전 출전. 전국('')도 한 줄로 센다
    const areas = (await (from
      ? sql`SELECT area, COALESCE(SUM(cnt),0)::int AS entries FROM score_dist
            WHERE date >= ${from} GROUP BY area ORDER BY entries DESC LIMIT 20`
      : sql`SELECT area, COALESCE(SUM(cnt),0)::int AS entries FROM score_dist
            GROUP BY area ORDER BY entries DESC LIMIT 20`)) as { area: string; entries: number }[];
    out.areas = areas;

    const users = (await (fromTs
      ? sql`SELECT
              COUNT(*) FILTER (WHERE created_at >= ${fromTs}::timestamptz)::int AS joined,
              COUNT(*)::int AS total
            FROM app_user`
      : sql`SELECT COUNT(*)::int AS joined, COUNT(*)::int AS total FROM app_user`)) as {
      joined: number;
      total: number;
    }[];
    const withRecord = (await sql`SELECT COUNT(*)::int AS n FROM user_state`) as { n: number }[];
    out.users = {
      joined: users[0]?.joined ?? 0,
      total: users[0]?.total ?? 0,
      withRecord: withRecord[0]?.n ?? 0,
    };

    const bugs = (await (fromTs
      ? sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE awarded)::int AS awarded
            FROM bug_report WHERE created_at >= ${fromTs}::timestamptz`
      : sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE awarded)::int AS awarded FROM bug_report`)) as {
      total: number;
      awarded: number;
    }[];
    out.bugs = { total: bugs[0]?.total ?? 0, awarded: bugs[0]?.awarded ?? 0 };
  } catch {
    // DB가 없거나 흔들려도 화면은 뜬다. 숫자가 0인 것과 못 읽은 것을
    // 구분해야 하지만, 여기서는 운영자만 보는 화면이라 빈 표로 둔다
  }
  return out;
}
