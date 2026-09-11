import { neon } from "@neondatabase/serverless";
import { mergeStates, sanitizeState, type SyncState } from "./sync";

/**
 * 계정·기록 저장 (Neon: app_user + user_state).
 * stats.ts와 같은 원칙 — DB 오류는 게임/로그인을 막지 않고 조용히 강등한다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/** 구글 프로필로 사용자 upsert. 실패 시 null(로그인 실패 처리) */
export async function upsertUser(googleSub: string, email: string | null, name: string | null): Promise<number | null> {
  if (!sql) return null;
  try {
    const rows = (await sql`
      INSERT INTO app_user (google_sub, email, name)
      VALUES (${googleSub}, ${email}, ${name})
      ON CONFLICT (google_sub) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, app_user.email),
          name = COALESCE(EXCLUDED.name, app_user.name)
      RETURNING id`) as { id: number }[];
    return rows[0] ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}

export async function getUserState(uid: number): Promise<SyncState | null> {
  if (!sql) return null;
  try {
    const rows = (await sql`SELECT state FROM user_state WHERE user_id = ${uid}`) as { state: unknown }[];
    return rows[0] ? sanitizeState(rows[0].state) : null;
  } catch {
    return null;
  }
}

/** 들어온 기록을 서버 보관본과 병합해 저장하고, 병합 결과를 돌려준다 */
export async function mergeUserState(uid: number, incoming: SyncState): Promise<SyncState | null> {
  if (!sql) return null;
  try {
    const existing = await getUserState(uid);
    const merged = existing ? mergeStates(existing, incoming) : incoming;
    const json = JSON.stringify(merged);
    await sql`
      INSERT INTO user_state (user_id, state, updated_at)
      VALUES (${uid}, ${json}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET state = ${json}::jsonb, updated_at = now()`;
    return merged;
  } catch {
    return null;
  }
}
