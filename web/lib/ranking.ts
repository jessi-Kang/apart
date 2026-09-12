import { neon } from "@neondatabase/serverless";

/**
 * 구역 명부: 같은 담당 구역 감별사들의 직급 순위.
 *
 * 순위 기준은 누적 점수(xp)다. 최고 연속 같은 단일 기록은 운 좋은 한 판이
 * 굳어 버리는데, 누적 점수는 세 창구에서 꾸준히 푼 사람이 올라간다.
 *
 * 구역끼리 비교하는 화면은 만들지 않는다(같은 구역 안에서만 줄을 세운다).
 * 어느 동네가 더 잘한다는 표는 이 서비스가 만들 것이 아니다.
 *
 * stats.ts·userdb.ts와 같은 원칙 — DB가 없거나 실패하면 조용히 빈 명부를
 * 돌려주고 게임을 막지 않는다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export interface RankRow {
  rank: number;
  name: string; // 이미 가려진 이름
  xp: number;
  me: boolean;
}

export interface RankBoard {
  rows: RankRow[];
  total: number;
  /** 내 자리. 명부에 없으면 null (로그인 안 했거나 기록이 아직 없다) */
  mine: RankRow | null;
}

/**
 * 이름 가리기. 명부는 누구나 보는 화면이라 구글 표시 이름을 그대로 걸지 않는다.
 * 첫 글자와 끝 글자만 남기고 가운데를 별로 덮는다. 두 글자는 끝 글자만,
 * 한 글자는 그대로 둔다(더 가릴 것이 없다).
 * 공백으로 나뉜 이름은 토막마다 따로 가린다 ("Jessi Kang" → "J***i K**g").
 */
export function maskName(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "감별사";
  return name
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return part;
      if (part.length === 2) return `${part[0]}*`;
      return `${part[0]}${"*".repeat(part.length - 2)}${part[part.length - 1]}`;
    })
    .join(" ");
}

const TOP = 50; // 명부 첫 장에 싣는 수

/**
 * @param area 담당 구역 (빈 문자열이면 구역을 안 고른 사람들끼리)
 * @param uid  보는 사람 (없으면 mine은 null)
 */
export async function areaBoard(area: string, uid: number | null): Promise<RankBoard> {
  if (!sql) return { rows: [], total: 0, mine: null };
  try {
    // 점수가 같으면 먼저 기록한 쪽이 위로 간다 — 같은 점수에서 순위가
    // 새로고침마다 바뀌면 명부로 읽히지 않는다
    const rows = (await sql`
      SELECT u.id, u.name, COALESCE((s.state->>'xp')::int, 0) AS xp, s.updated_at
      FROM user_state s
      JOIN app_user u ON u.id = s.user_id
      WHERE COALESCE(s.state->>'area', '') = ${area}
        AND COALESCE((s.state->>'xp')::int, 0) > 0
      ORDER BY xp DESC, s.updated_at ASC, u.id ASC
      LIMIT ${TOP}`) as { id: number; name: string | null; xp: number }[];

    const countRows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM user_state s
      WHERE COALESCE(s.state->>'area', '') = ${area}
        AND COALESCE((s.state->>'xp')::int, 0) > 0`) as { n: number }[];
    const total = countRows[0]?.n ?? 0;

    const out: RankBoard = {
      rows: rows.map((r, i) => ({
        rank: i + 1,
        name: maskName(r.name),
        xp: Number(r.xp),
        me: uid !== null && Number(r.id) === uid,
      })),
      total,
      mine: null,
    };
    out.mine = out.rows.find((r) => r.me) ?? null;
    if (out.mine || uid === null) return out;

    // 첫 장 밖이면 내 줄만 따로 센다. 한참 아래여도 내 순위는 보여야 한다
    const meRows = (await sql`
      SELECT u.name, COALESCE((s.state->>'xp')::int, 0) AS xp, s.updated_at
      FROM user_state s
      JOIN app_user u ON u.id = s.user_id
      WHERE s.user_id = ${uid} AND COALESCE(s.state->>'area', '') = ${area}`) as {
      name: string | null;
      xp: number;
      updated_at: string;
    }[];
    const me = meRows[0];
    if (!me || Number(me.xp) <= 0) return out;

    const aheadRows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM user_state s
      WHERE COALESCE(s.state->>'area', '') = ${area}
        AND (
          COALESCE((s.state->>'xp')::int, 0) > ${Number(me.xp)}
          OR (COALESCE((s.state->>'xp')::int, 0) = ${Number(me.xp)} AND s.updated_at < ${me.updated_at})
        )`) as { n: number }[];

    out.mine = {
      rank: (aheadRows[0]?.n ?? 0) + 1,
      name: maskName(me.name),
      xp: Number(me.xp),
      me: true,
    };
    return out;
  } catch {
    return { rows: [], total: 0, mine: null };
  }
}
