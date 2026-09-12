import { neon } from "@neondatabase/serverless";

/**
 * 버그 제보함.
 *
 * 쓴 사람이 겪은 것을 그대로 받는 자리다. 고치는 쪽에서 제일 아쉬운 것이
 * "어느 화면에서 그랬나"라 그 칸을 따로 둔다. 브라우저 종류도 같이 받는다 —
 * 폰에서만 나는 문제를 데스크탑에서 아무리 봐도 안 보인다.
 *
 * 로그인한 사람은 계정을 함께 남겨 되물을 수 있게 하고, 비회원도 그냥 낼 수
 * 있다. 버그를 알려 주러 온 사람에게 로그인부터 하라고 하면 대부분 그냥 간다.
 *
 * stats.ts와 같은 원칙 — DB가 없거나 실패해도 게임은 그대로 돌아간다.
 * 다만 제보는 실패를 숨기면 안 된다. 썼는데 안 들어간 것을 들어간 줄 알면
 * 두 번 잃는 셈이라, 저장 실패는 그대로 알린다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const MAX_BODY = 1000;
export const MAX_WHERE = 60;
/** 제보 한 건에 주는 점수. 감별 한두 문제 값이다 — 고맙다는 표시지 벌이가 아니다 */
export const BUG_POINTS = 15;
/** 하루에 점수를 받을 수 있는 제보 수 */
export const AWARD_PER_DAY = 3;
/** 이 시간 안에 다시 내면 점수를 주지 않는다 (초) */
export const AWARD_COOLDOWN_SEC = 120;
/** 이보다 짧으면 제보로 보지 않는다 */
export const MIN_BODY = 10;

export interface BugRow {
  id: number;
  body: string;
  where_at: string;
  ua: string;
  user_id: number | null;
  created_at: string;
  handled: boolean;
}

/**
 * 점수를 줘도 되는가.
 *
 * 제보에 점수를 붙이면 점수를 노린 제보가 따라온다. 아무 말이나 여러 번
 * 적어 내는 쪽을 막되, 진짜로 여러 개를 발견한 사람까지 막지는 않는다.
 *   - 로그인한 사람만. 비회원은 서버가 누군지 몰라 몇 번을 냈는지 셀 수가 없다
 *   - 하루 세 건까지
 *   - 낸 직후 2분 안에 또 내면 점수 없음 (제보 자체는 받는다)
 * 조건에 걸려도 제보는 저장된다. 점수를 못 받는 것과 말을 못 전하는 것은 다르다.
 */
async function canAward(uid: number | null): Promise<boolean> {
  if (!sql || uid === null) return false;
  try {
    const rows = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE awarded AND created_at > now() - interval '1 day')::int AS today,
        COUNT(*) FILTER (WHERE created_at > now() - make_interval(secs => ${AWARD_COOLDOWN_SEC}))::int AS recent
      FROM bug_report WHERE user_id = ${uid}`) as { today: number; recent: number }[];
    const r = rows[0];
    return Boolean(r) && r.today < AWARD_PER_DAY && r.recent === 0;
  } catch {
    return false;
  }
}

export interface SaveResult {
  ok: boolean;
  /** 점수를 받았는가 */
  awarded: boolean;
  points: number;
}

/** 제보 저장 + 점수 지급 여부 판단 */
export async function saveBug(input: {
  body: string;
  where: string;
  ua: string;
  uid: number | null;
}): Promise<SaveResult> {
  if (!sql) return { ok: false, awarded: false, points: 0 };
  try {
    const awarded = await canAward(input.uid);
    await sql`
      INSERT INTO bug_report (body, where_at, ua, user_id, awarded)
      VALUES (${input.body.slice(0, MAX_BODY)}, ${input.where.slice(0, MAX_WHERE)}, ${input.ua.slice(0, 200)}, ${input.uid}, ${awarded})`;
    return { ok: true, awarded, points: awarded ? BUG_POINTS : 0 };
  } catch {
    return { ok: false, awarded: false, points: 0 };
  }
}

/** 최근 제보 (운영자 화면용) */
export async function recentBugs(limit = 50): Promise<BugRow[]> {
  if (!sql) return [];
  try {
    return (await sql`
      SELECT id, body, where_at, ua, user_id, created_at, handled
      FROM bug_report ORDER BY created_at DESC LIMIT ${limit}`) as BugRow[];
  } catch {
    return [];
  }
}
