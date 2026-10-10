import { neon } from "@neondatabase/serverless";
import { maxQuestionScore, type GameKey } from "./scoring";
import type { SyncState } from "./sync";

/**
 * 경험치 한도. 클라이언트가 올린 경험치를 서버가 본 적중으로 묶는다.
 *
 * 왜 있나. 경험치는 클라이언트가 계산해 `/api/state`로 올리고, 서버는 형식만
 * 보고 "큰 쪽"으로 병합해 저장했다. 그래서 로그인한 아무나
 * `{"xp":9999999,"areaXp":{"서울특별시":9999999}}`를 PUT 하면 구역 명부 1위가
 * 됐고, 병합이 큰 쪽을 남기므로 영영 내려오지 않았다. 명부가 공개 순위표라
 * 이 서비스에서 가장 큰 구멍이었다.
 *
 * 어떻게 막나. 판정은 원래 서버만 한다. 그래서 로그인한 사람이 맞힐 때마다
 * "그 문제로 벌 수 있는 최대 점수"를 여기 더해 둔다. 올라온 경험치는 이 한도를
 * 넘지 못한다. 속도 보너스 같은 세부 계산은 지금처럼 클라이언트가 하되, **실제로
 * 맞힌 적 없는 점수는 올릴 수 없다.**
 *
 * 남는 것: 맞히는 기계를 돌리면 한도도 같이 오른다. 그래서 적중은 0.6초에 한
 * 번만 센다(정답 공개를 보고 다음 문제로 넘어가는 사람의 손은 그보다 느리다).
 * 그래도 하루 종일 도는 기계는 사람보다 많이 번다 — 그건 이 방식으로 못 막는다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/** 처음 보는 계정이 비회원 때 쌓아 온 것으로 인정하는 상한 */
export const GUEST_IMPORT = 3000;
/** 무한 연속 보너스(최대 10)와 완주·기록 보너스를 넉넉히 덮는 여유 */
const SLACK = 15;
/** 적중을 세는 최소 간격 */
const MIN_GAP_MS = 600;

let ready: Promise<void> | null = null;
/** 테이블은 처음 쓸 때 만든다. 손으로 따로 만드는 걸음을 두면 배포와 어긋난다 */
function ensure(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!ready) {
    ready = sql`
      CREATE TABLE IF NOT EXISTS xp_budget (
        user_id   integer PRIMARY KEY,
        budget    integer NOT NULL,
        last_at   timestamptz NOT NULL DEFAULT now()
      )`.then(() => undefined, () => {
      ready = null; // 다음 요청에서 다시 시도한다
    });
  }
  return ready;
}

/**
 * 첫 줄을 만들 때의 기준값: 이미 기록이 있는 계정은 지금 경험치를, 처음 보는
 * 계정은 비회원 이월분만큼을 인정한다. 이걸 0으로 두면 기존 사용자가 다음
 * 적중부터 오르지 않는다.
 */
// (쿼리 조각을 끼워 넣지 않고 각 문장에 풀어 쓴다 — 드라이버가 중첩을 받지 않는다)

/** 로그인한 사람이 맞혔다. 그 문제로 벌 수 있는 최대치를 한도에 더한다 */
export async function creditCorrect(uid: number | null | undefined, game: GameKey): Promise<void> {
  if (!sql || !uid) return;
  const credit = maxQuestionScore(game) + SLACK;
  try {
    await ensure();
    await sql`
      INSERT INTO xp_budget (user_id, budget, last_at)
      VALUES (${uid}, COALESCE((SELECT (state->>'xp')::int FROM user_state WHERE user_id = ${uid}), ${GUEST_IMPORT}) + ${credit}, now())
      ON CONFLICT (user_id) DO UPDATE
        SET budget = xp_budget.budget + ${credit}, last_at = now()
        WHERE now() - xp_budget.last_at > ${`${MIN_GAP_MS} milliseconds`}::interval`;
  } catch {
    /* 한도를 못 올려도 게임은 계속된다. 다음 동기화에서 덜 오를 뿐이다 */
  }
}

async function budgetOf(uid: number): Promise<number | null> {
  if (!sql) return null;
  try {
    await ensure();
    const rows = (await sql`
      INSERT INTO xp_budget (user_id, budget) VALUES (${uid}, COALESCE((SELECT (state->>'xp')::int FROM user_state WHERE user_id = ${uid}), ${GUEST_IMPORT}))
      ON CONFLICT (user_id) DO UPDATE SET budget = xp_budget.budget
      RETURNING budget`) as { budget: number }[];
    return rows[0] ? Number(rows[0].budget) : null;
  } catch {
    return null;
  }
}

/**
 * 병합 결과를 한도로 깎는다.
 *
 * 이미 저장돼 있던 값은 깎지 않는다 — 깎으면 기존 기록이 사라진다. 막는 것은
 * **늘어나는 쪽**이다. 구역별 경험치는 한 점이 늘 한 구역에만 들어가므로, 구역들의
 * 증가분 합이 전체 증가분을 넘지 않게 같은 비율로 줄인다(안 그러면 3,000을
 * 열다섯 구역에 다 적어 넣을 수 있다).
 */
export async function clampToBudget(uid: number, existing: SyncState | null, merged: SyncState): Promise<SyncState> {
  const budget = await budgetOf(uid);
  if (budget === null) {
    // 한도를 못 읽으면 늘어나는 것을 받지 않는다. 열어 두는 쪽으로 기울면 안 된다
    return existing ? { ...merged, xp: existing.xp, areaXp: existing.areaXp } : { ...merged, xp: 0, areaXp: undefined };
  }
  const prevXp = existing?.xp ?? 0;
  const cap = Math.max(prevXp, budget);
  const xp = Math.min(merged.xp ?? 0, cap);

  const prevArea = existing?.areaXp ?? {};
  const nextArea = merged.areaXp ?? {};
  const deltas: Record<string, number> = {};
  let deltaSum = 0;
  for (const [k, v] of Object.entries(nextArea)) {
    const d = Math.max(0, v - (prevArea[k] ?? 0));
    if (d > 0) {
      deltas[k] = d;
      deltaSum += d;
    }
  }
  const prevAreaSum = Object.values(prevArea).reduce((a, b) => a + b, 0);
  const room = Math.max(0, xp - prevAreaSum);
  const scale = deltaSum > room ? room / deltaSum : 1;
  const areaXp: Record<string, number> = { ...prevArea };
  for (const [k, d] of Object.entries(deltas)) areaXp[k] = (prevArea[k] ?? 0) + Math.floor(d * scale);

  return {
    ...merged,
    ...(xp > 0 ? { xp } : { xp: undefined }),
    ...(Object.keys(areaXp).length ? { areaXp } : { areaXp: undefined }),
  };
}
