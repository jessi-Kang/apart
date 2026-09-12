import { neon } from "@neondatabase/serverless";

/**
 * 구역 명부: 그 구역에서 친 기록이 있는 사람들의 순위.
 *
 * 구역은 사람에게 딸린 값이 아니다. 그때그때 고르는 출제 범위라,
 * 서울에서도 치고 부산에서도 친 사람은 두 명부에 모두 올라야 한다.
 * 그래서 "지금 고른 구역"이 아니라 "그 구역에서 쌓은 점수"로 줄을 세운다.
 *
 * 순위 기준은 그 구역의 누적 점수다. 최고 연속 같은 단일 기록은 운 좋은
 * 한 판이 굳어 버리는데, 누적 점수는 꾸준히 푼 사람이 올라간다.
 * 점수는 창구별·속도별로 갈리므로(lib/scoring.ts) 동점이 잘 생기지 않는다.
 *
 * 사람이 너무 적을 때는 명부를 열지 않는다. 두세 명뿐인 명부는 순위가
 * 아니라 명단이고, 이름이 그대로 드러나는 것에 가깝다.
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
  /** 내 자리. 명부에 없으면 null (로그인 안 했거나 그 구역 기록이 없다) */
  mine: RankRow | null;
  /** 사람이 문턱에 못 미쳐 명부를 안 연 상태 */
  locked: boolean;
  /** 명부가 열리는 최소 인원 */
  minPlayers: number;
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
 * 명부가 열리는 최소 인원.
 * 셋뿐인 명부는 순위표가 아니라 명단이다. 가린 이름이라도 누가 누군지
 * 짐작되기 쉽고, 1등이 곧 전부인 표는 겨룰 맛도 없다.
 */
export const MIN_PLAYERS = 10;

/**
 * @param area 담당 구역 (빈 문자열이면 구역을 안 고른 사람들끼리)
 * @param uid  보는 사람 (없으면 mine은 null)
 */
export async function areaBoard(area: string, uid: number | null): Promise<RankBoard> {
  const empty: RankBoard = { rows: [], total: 0, mine: null, locked: false, minPlayers: MIN_PLAYERS };
  if (!sql) return empty;
  try {
    // 이 구역에서 쌓은 점수로 줄을 세운다. "지금 고른 구역"이 아니다 —
    // 구역을 옮겨도 전에 친 구역의 기록은 그 명부에 그대로 남아야 한다
    const countRows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM user_state s
      WHERE COALESCE((s.state->'areaXp'->>${area})::int, 0) > 0`) as { n: number }[];
    const total = countRows[0]?.n ?? 0;

    // 내 자리는 명부가 잠겨 있어도 알려 준다. 내 기록을 내가 못 보는 건 이상하다
    const mine = uid === null ? null : await myRow(area, uid);

    if (total < MIN_PLAYERS) return { rows: [], total, mine, locked: true, minPlayers: MIN_PLAYERS };

    // 점수가 같으면 먼저 기록한 쪽이 위로 간다 — 같은 점수에서 순위가
    // 새로고침마다 바뀌면 명부로 읽히지 않는다
    const rows = (await sql`
      SELECT u.id, u.name, COALESCE((s.state->'areaXp'->>${area})::int, 0) AS xp
      FROM user_state s
      JOIN app_user u ON u.id = s.user_id
      WHERE COALESCE((s.state->'areaXp'->>${area})::int, 0) > 0
      ORDER BY xp DESC, s.updated_at ASC, u.id ASC
      LIMIT ${TOP}`) as { id: number; name: string | null; xp: number }[];

    const out: RankBoard = {
      rows: rows.map((r, i) => ({
        rank: i + 1,
        name: maskName(r.name),
        xp: Number(r.xp),
        me: uid !== null && Number(r.id) === uid,
      })),
      total,
      mine: null,
      locked: false,
      minPlayers: MIN_PLAYERS,
    };
    out.mine = out.rows.find((r) => r.me) ?? mine;
    return out;
  } catch {
    return empty;
  }
}

/** 첫 장 밖이어도 내 순위는 세어 준다. 한참 아래여도 내 자리는 보여야 한다 */
async function myRow(area: string, uid: number): Promise<RankRow | null> {
  if (!sql) return null;
  const meRows = (await sql`
    SELECT u.name, COALESCE((s.state->'areaXp'->>${area})::int, 0) AS xp, s.updated_at
    FROM user_state s
    JOIN app_user u ON u.id = s.user_id
    WHERE s.user_id = ${uid}`) as { name: string | null; xp: number; updated_at: string }[];
  const me = meRows[0];
  if (!me || Number(me.xp) <= 0) return null;

  const aheadRows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM user_state s
    WHERE COALESCE((s.state->'areaXp'->>${area})::int, 0) > ${Number(me.xp)}
       OR (COALESCE((s.state->'areaXp'->>${area})::int, 0) = ${Number(me.xp)} AND s.updated_at < ${me.updated_at})`) as {
    n: number;
  }[];

  return { rank: (aheadRows[0]?.n ?? 0) + 1, name: maskName(me.name), xp: Number(me.xp), me: true };
}
