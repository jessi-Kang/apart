import { neon } from "@neondatabase/serverless";
import { AWARD_PER_DAY, COIN_POINTS } from "./coinrule";
import { fakeNames } from "./data";

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

/**
 * 지금 실제로 출제되는 가짜 이름들.
 *
 * 승인 표시(approved)와 출제는 다른 단계다. 출제 풀은 정적 JSON이고 공식전은
 * (날짜, 구역) 시드로 결정론이어야 해서, 런타임에 DB를 섞으면 같은 날 같은
 * 구역인데 사람마다 문제가 달라진다. 그래서 승인된 이름은 내보내기를 거쳐
 * 풀에 들어간 뒤에야 출제된다 — 여기서 그 사실 여부를 본다.
 */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const livePool = new Set(fakeNames.map((f) => norm(f.name)));

export { COIN_POINTS, AWARD_PER_DAY } from "./coinrule";

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
  /**
   * 보고 안 쓰기로 한 것.
   *
   * approved 하나만으로는 "아직 안 본 것"과 "보고 버린 것"이 같은 칸에 놓여,
   * 훑을 때마다 이미 판단한 이름을 다시 읽게 된다. 지우지 않고 표시만 남기는
   * 이유는 같은 이름이 다시 접수됐을 때 왜 뺐는지 알 수 있어야 해서다.
   */
  rejected: boolean;
}

/** 접수된 작명의 처리 상태 */
export type CoinStatus = "pending" | "approved" | "rejected";

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

/**
 * 접수된 작명 (운영자 화면용).
 *
 * 대기 중인 것이 맨 위로 온다 — 훑는 목적이 "아직 판단 안 한 것 처리"라서다.
 * 쪽으로 나눠 준다. 이름은 계속 쌓이는데 한 번에 다 그리면 운영 화면이
 * 수천 줄이 된다(37건에서 이미 9,190px이었다).
 */
export async function recentCoined(
  limit = 20,
  offset = 0,
  onlyPending = false,
): Promise<{ rows: CoinedRow[]; total: number; pending: number }> {
  if (!sql) return { rows: [], total: 0, pending: 0 };
  try {
    const counts = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE NOT approved AND NOT rejected)::int AS pending
      FROM coined_name`) as { total: number; pending: number }[];
    const rows = (onlyPending
      ? await sql`
      SELECT id, name, area, user_id, created_at, approved, rejected
      FROM coined_name
      WHERE NOT approved AND NOT rejected
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`
      : await sql`
      SELECT id, name, area, user_id, created_at, approved, rejected
      FROM coined_name
      ORDER BY (approved OR rejected), created_at DESC
      LIMIT ${limit} OFFSET ${offset}`) as CoinedRow[];
    // id는 bigint라 드라이버가 문자열로 돌려준다. 타입만 number라고 적어 두면
    // 화면이 그 문자열을 그대로 되돌려 보내고, 서버의 정수 검사에 걸려
    // 승인 단추가 조용히 400을 받는다(실제로 그렇게 안 눌렸다)
    return {
      rows: rows.map((r) => ({ ...r, id: Number(r.id) })),
      total: Number(counts[0]?.total ?? 0),
      pending: Number(counts[0]?.pending ?? 0),
    };
  } catch {
    return { rows: [], total: 0, pending: 0 };
  }
}

/**
 * 승인·반려를 표시한다. 지우지 않는다 — 같은 이름이 다시 들어왔을 때
 * 전에 왜 뺐는지 알 수 있어야 하고, 접수한 사람의 목록에서도 사라지면 안 된다.
 *
 * 승인은 "출제해도 되는 이름"이라는 표시일 뿐, 그 자체로 출제되지는 않는다.
 * 출제 풀은 정적 JSON이고 공식전은 (날짜, 구역) 시드로 결정론이어야 해서,
 * 런타임에 DB를 섞으면 같은 날 같은 구역인데 사람마다 문제가 달라진다.
 * 승인된 이름을 실제로 내보내는 것은 `npm run export-coined`가 한다.
 */
export async function setCoinedStatus(id: number, status: CoinStatus): Promise<boolean> {
  if (!sql) return false;
  try {
    const rows = (await sql`
      UPDATE coined_name
      SET approved = ${status === "approved"}, rejected = ${status === "rejected"}
      WHERE id = ${id}
      RETURNING id`) as { id: number }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** 승인됐고 아직 안 내보낸 것까지 포함한, 출제로 보낼 수 있는 이름 전부 */
export async function approvedCoined(): Promise<{ name: string; area: string }[]> {
  if (!sql) return [];
  try {
    return (await sql`
      SELECT name, area FROM coined_name
      WHERE approved AND NOT rejected
      ORDER BY created_at`) as { name: string; area: string }[];
  } catch {
    return [];
  }
}

/** 내가 지은 이름 한 줄 (속은 집계를 붙인 것) */
export interface MyCoinedRow {
  name: string;
  area: string;
  approved: boolean;
  rejected: boolean;
  /** 출제 풀에 실제로 올라갔는가. 승인 표시와 출제는 다른 단계다 */
  live: boolean;
  /** 감별 창구에 몇 번 걸렸나 */
  shown: number;
  /** 그중 몇 명이 속았나 */
  fooled: number;
}

export interface MyCoined {
  /** 접수한 이름 수 */
  accepted: number;
  /** 내 이름들이 속인 사람 수 합계 */
  fooled: number;
  /** 내 이름들이 걸린 횟수 합계 */
  shown: number;
  items: MyCoinedRow[];
}

/** 합계만. 호칭을 매기는 데는 목록이 필요 없다 (작명 접수 응답에서 쓴다) */
export async function myCoinTotals(uid: number): Promise<{ accepted: number; fooled: number; shown: number }> {
  const empty = { accepted: 0, fooled: 0, shown: 0 };
  if (!sql) return empty;
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS accepted,
             COALESCE(SUM(s.fooled), 0)::int AS fooled,
             COALESCE(SUM(s.shown), 0)::int AS shown
      FROM coined_name c
      LEFT JOIN name_stats s ON s.name = c.name AND s.kind = 'fake'
      WHERE c.user_id = ${uid}`) as { accepted: number; fooled: number; shown: number }[];
    const r = rows[0];
    return r ? { accepted: Number(r.accepted), fooled: Number(r.fooled), shown: Number(r.shown) } : empty;
  } catch {
    return empty;
  }
}

/**
 * 목록을 어떤 순서로 볼 것인가.
 * fooled  잘 속인 순 — 자랑거리가 맨 위
 * recent  최근 접수 순 — 방금 지은 것이 어떻게 됐는지 볼 때
 */
export type CoinSort = "fooled" | "recent";

/**
 * 내가 지은 이름과 그 성적.
 *
 * 작명소는 "몇 명이 속았는지 세어 알려 드린다"고 약속한다. 그 약속을 지키는
 * 곳이 여기다. 집계는 name_stats에 이름 단위로 쌓이므로(namestats.ts) 접수
 * 대장과 이름으로 맞춰 붙인다 — 지은 이름은 감별 창구에서 가짜로 나가므로
 * kind는 'fake' 쪽만 본다.
 *
 * 아직 출제 전인 이름은 shown이 0이다. 0도 그대로 보여준다 — 줄을 감추면
 * 접수한 것이 사라진 줄 안다. 대신 왜 0인지를 상태로 말해 준다(검토 중 ·
 * 출제 대기 · 반려).
 */
export async function myCoined(
  uid: number,
  limit = 20,
  offset = 0,
  sort: CoinSort = "fooled",
): Promise<MyCoined> {
  const empty: MyCoined = { accepted: 0, fooled: 0, shown: 0, items: [] };
  if (!sql) return empty;
  try {
    // 이름은 계속 쌓인다. 한 번에 다 내려주면 언젠가 응답이 감당 못 할 만큼
    // 커지므로 처음부터 쪽으로 나눠 준다. 정렬 값은 열거형이라 문자열을
    // 질의에 끼워 넣지 않는다 — 갈래를 나눠 둘 다 매개변수 질의로 둔다
    const rows = (sort === "recent"
      ? await sql`
      SELECT c.name, c.area, c.approved, c.rejected,
             COALESCE(s.shown, 0)::int AS shown,
             COALESCE(s.fooled, 0)::int AS fooled
      FROM coined_name c
      LEFT JOIN name_stats s ON s.name = c.name AND s.kind = 'fake'
      WHERE c.user_id = ${uid}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${limit} OFFSET ${offset}`
      : await sql`
      SELECT c.name, c.area, c.approved, c.rejected,
             COALESCE(s.shown, 0)::int AS shown,
             COALESCE(s.fooled, 0)::int AS fooled
      FROM coined_name c
      LEFT JOIN name_stats s ON s.name = c.name AND s.kind = 'fake'
      WHERE c.user_id = ${uid}
      ORDER BY COALESCE(s.fooled, 0) DESC, c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`) as MyCoinedRow[];
    // 합계는 목록과 따로 센다. 목록은 limit에서 잘리므로 거기서 더하면
    // 이름이 많아진 사람의 합계가 조용히 줄어든다
    const totals = await myCoinTotals(uid);
    return {
      ...totals,
      // "승인됨"과 "출제 중"은 다른 단계다. 승인은 표시일 뿐이고, 실제로
      // 출제되는 것은 내보내기를 거쳐 정적 풀에 들어간 뒤다. 화면이 이 둘을
      // 뭉뚱그리면 승인되자마자 문제로 나온 줄 알고 기다리게 된다
      items: rows.map((r) => ({
        ...r,
        shown: Number(r.shown),
        fooled: Number(r.fooled),
        live: livePool.has(norm(r.name)),
      })),
    };
  } catch {
    return empty;
  }
}
