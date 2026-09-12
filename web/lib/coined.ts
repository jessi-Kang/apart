import { neon } from "@neondatabase/serverless";

/**
 * 접수된 작명 (작명소).
 *
 * 지은 이름을 곧바로 출제 풀에 넣지 않는다. 사람이 짓는 이름은 욕설·비하가
 * 섞일 수 있고, 형식 검사만으로는 다 거를 수 없다. 그래서 여기 쌓아 두고
 * 운영자가 승인한 것만 출제로 보낸다(approved).
 *
 * bugs.ts와 같은 원칙 — DB가 없거나 흔들려도 게임은 그대로 돌아간다.
 * 다만 접수는 실패를 숨기지 않는다. 지었는데 안 들어간 것을 들어간 줄 알면
 * 두 번 잃는다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/** 작명 한 건에 주는 점수. 감별 한 문제 값이다 — 고맙다는 표시지 벌이가 아니다 */
export const COIN_POINTS = 12;
/** 하루에 점수를 받을 수 있는 작명 수 */
export const AWARD_PER_DAY = 5;

export interface CoinResult {
  ok: boolean;
  /** 실패 사유. 저장이 안 된 것과 이미 있는 이름인 것은 다른 일이다 */
  reason?: "duplicate" | "store";
  awarded: boolean;
  points: number;
  /** 접수번호. 창구에서 받아 가는 번호라 실제로 들어간 행 번호를 쓴다 */
  no?: string;
}

export interface CoinedRow {
  id: number;
  name: string;
  area: string;
  user_id: number | null;
  created_at: string;
  approved: boolean;
}

/**
 * 점수를 줘도 되는가.
 * 로그인한 사람만, 하루 다섯 건까지. 비회원은 서버가 누군지 몰라 셀 수가 없다.
 * 조건에 걸려도 작명은 저장된다 — 점수를 못 받는 것과 이름이 안 남는 것은 다르다.
 */
async function canAward(uid: number | null): Promise<boolean> {
  if (!sql || uid === null) return false;
  try {
    const rows = (await sql`
      SELECT COUNT(*) FILTER (WHERE awarded AND created_at > now() - interval '1 day')::int AS today
      FROM coined_name WHERE user_id = ${uid}`) as { today: number }[];
    return (rows[0]?.today ?? 0) < AWARD_PER_DAY;
  } catch {
    return false;
  }
}

export async function saveCoined(input: { name: string; area: string; uid: number | null }): Promise<CoinResult> {
  if (!sql) return { ok: false, reason: "store", awarded: false, points: 0 };
  try {
    const awarded = await canAward(input.uid);
    const rows = (await sql`
      INSERT INTO coined_name (name, area, user_id, awarded)
      VALUES (${input.name}, ${input.area}, ${input.uid}, ${awarded})
      ON CONFLICT (name) DO NOTHING
      RETURNING id`) as { id: number }[];
    // 같은 이름이 이미 접수돼 있으면 새 행이 안 생긴다. 아직 출제 풀에 오르지
    // 않은 이름은 판정에서 안 걸리므로, 여기가 마지막 그물이다
    if (!rows[0]) return { ok: false, reason: "duplicate", awarded: false, points: 0 };
    return {
      ok: true,
      awarded,
      points: awarded ? COIN_POINTS : 0,
      no: `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(rows[0].id).padStart(4, "0")}`,
    };
  } catch {
    return { ok: false, reason: "store", awarded: false, points: 0 };
  }
}

/** 접수된 작명 (운영자 화면용) */
export async function recentCoined(limit = 100): Promise<CoinedRow[]> {
  if (!sql) return [];
  try {
    return (await sql`
      SELECT id, name, area, user_id, created_at, approved
      FROM coined_name ORDER BY created_at DESC LIMIT ${limit}`) as CoinedRow[];
  } catch {
    return [];
  }
}
