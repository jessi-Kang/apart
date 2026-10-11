import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { RunMode } from "./run";

/**
 * 도전장. 내 판을 같은 이름·같은 순서로 남에게 치게 보내는 링크다.
 *
 * 링크에는 짧은 번호만 싣고, 시드·구역·시작 번호·넘을 기록은 여기 둔다.
 * 링크에 시드를 그대로 실으면 받는 사람이 판을 미리 열어 볼 수 있는 건
 * 마찬가지지만, 기록 숫자를 고쳐 "연속 99"짜리 도전장을 만들 수 있게 된다.
 *
 * 받은 사람의 결과는 첫 판만 센다(같은 사람이 다시 치면 이미 정답을 봤다).
 * 보낸 사람은 기록 열람실에서 몇 명이 받았고 몇 명이 넘었는지 본다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export interface Challenge {
  code: string;
  /** 어느 창구의 판인가 */
  mode: RunMode;
  seed: number;
  area: string;
  start: number;
  target: number;
  senderUid: number | null;
  /** 가린 이름 (지*현). 비회원이 보냈으면 빈 값 */
  label: string;
}

const ALPHA = "23456789abcdefghjkmnpqrstuvwxyz";
export const isCode = (x: unknown): x is string => typeof x === "string" && /^[2-9a-hjkmnp-z]{8}$/.test(x);

function newCode(): string {
  const b = randomBytes(8);
  return Array.from(b, (n) => ALPHA[n % ALPHA.length]).join("");
}

/** 이름을 가린다. 김지현 → 김*현, 지현 → 지*, Jessi → J*i */
export function maskName(name: string | null | undefined): string {
  const c = [...(name ?? "").trim()];
  if (c.length === 0) return "";
  if (c.length <= 2) return `${c[0]}*`;
  return `${c[0]}*${c[c.length - 1]}`;
}

/* DB가 없으면(로컬 점검) 프로세스 메모리에 둔다. 운영에는 늘 DB가 있다 */
const mem = new Map<string, Challenge>();
const memTakes = new Map<string, Map<string, number>>();

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS challenge (
          code         text PRIMARY KEY,
          seed         bigint NOT NULL,
          area         text NOT NULL DEFAULT '',
          start        integer NOT NULL,
          target       integer NOT NULL,
          sender_uid   integer,
          sender_label text NOT NULL DEFAULT '',
          created_at   timestamptz NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS challenge_sender ON challenge (sender_uid)`;
      // 도전장이 감별 O/X에만 있던 때 만든 표에는 창구 칸이 없다
      await sql`ALTER TABLE challenge ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'ox'`;
      await sql`
        CREATE TABLE IF NOT EXISTS challenge_take (
          code       text NOT NULL,
          taker      text NOT NULL,
          best       integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (code, taker)
        )`;
    })().catch(() => {
      ready = null;
    });
  }
  return ready;
}

type Row = { code: string; mode: string; seed: string | number; area: string; start: number; target: number; sender_uid: number | null; sender_label: string };
const fromRow = (r: Row): Challenge => ({
  code: r.code,
  mode: (r.mode as RunMode) ?? "ox",
  seed: Number(r.seed),
  area: r.area,
  start: r.start,
  target: r.target,
  senderUid: r.sender_uid,
  label: r.sender_label,
});

/** 같은 판·같은 기록으로 두 번 누르면 같은 도전장을 돌려준다 */
export async function createChallenge(c: Omit<Challenge, "code">): Promise<string | null> {
  if (!sql) {
    for (const v of mem.values())
      if (v.mode === c.mode && v.seed === c.seed && v.start === c.start && v.target === c.target && v.senderUid === c.senderUid) return v.code;
    const code = newCode();
    mem.set(code, { ...c, code });
    return code;
  }
  try {
    await ensure();
    const prev = (await sql`
      SELECT code FROM challenge
      WHERE mode = ${c.mode} AND seed = ${c.seed} AND start = ${c.start} AND target = ${c.target}
        AND sender_uid IS NOT DISTINCT FROM ${c.senderUid}
      LIMIT 1`) as { code: string }[];
    if (prev[0]) return prev[0].code;
    const code = newCode();
    await sql`
      INSERT INTO challenge (code, mode, seed, area, start, target, sender_uid, sender_label)
      VALUES (${code}, ${c.mode}, ${c.seed}, ${c.area}, ${c.start}, ${c.target}, ${c.senderUid}, ${c.label})`;
    return code;
  } catch {
    return null;
  }
}

export async function getChallenge(code: unknown): Promise<Challenge | null> {
  if (!isCode(code)) return null;
  if (!sql) return mem.get(code) ?? null;
  try {
    await ensure();
    const rows = (await sql`
      SELECT code, mode, seed, area, start, target, sender_uid, sender_label
      FROM challenge WHERE code = ${code}`) as Row[];
    return rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/** 이 사람이 이 도전장을 이미 쳤는가 */
export async function hasTaken(code: string, taker: string): Promise<boolean> {
  if (!sql) return memTakes.get(code)?.has(taker) ?? false;
  try {
    await ensure();
    const rows = (await sql`SELECT 1 FROM challenge_take WHERE code = ${code} AND taker = ${taker}`) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** 받은 사람의 결과. 한 사람의 첫 판만 남는다 */
export async function recordTake(code: string, taker: string, best: number): Promise<void> {
  if (!sql) {
    const m = memTakes.get(code) ?? new Map<string, number>();
    if (!m.has(taker)) m.set(taker, best);
    memTakes.set(code, m);
    return;
  }
  try {
    await ensure();
    await sql`
      INSERT INTO challenge_take (code, taker, best) VALUES (${code}, ${taker}, ${best})
      ON CONFLICT (code, taker) DO NOTHING`;
  } catch {
    /* 집계가 흔들려도 게임은 막지 않는다 */
  }
}

export interface SentSummary {
  /** 보낸 도전장 수 */
  sent: number;
  /** 받아서 친 사람 수 (도전장별 합) */
  takes: number;
  /** 그중 내 기록을 넘은 사람 */
  beaten: number;
}

export async function sentSummary(uid: number): Promise<SentSummary> {
  if (!sql) {
    let sent = 0, takes = 0, beaten = 0;
    for (const c of mem.values()) {
      if (c.senderUid !== uid) continue;
      sent++;
      for (const b of memTakes.get(c.code)?.values() ?? []) {
        takes++;
        if (b > c.target) beaten++;
      }
    }
    return { sent, takes, beaten };
  }
  try {
    await ensure();
    const rows = (await sql`
      SELECT COUNT(DISTINCT c.code)::int AS sent,
             COUNT(t.taker)::int AS takes,
             COUNT(t.taker) FILTER (WHERE t.best > c.target)::int AS beaten
      FROM challenge c LEFT JOIN challenge_take t ON t.code = c.code
      WHERE c.sender_uid = ${uid}`) as SentSummary[];
    return rows[0] ?? { sent: 0, takes: 0, beaten: 0 };
  } catch {
    return { sent: 0, takes: 0, beaten: 0 };
  }
}
