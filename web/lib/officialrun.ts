import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";

/**
 * 공식전 한 판의 진행 상태.
 *
 * 왜 필요한가. 판정 라우트가 같은 문제를 몇 번이고 받아 주고 있었다. 한 문제에
 * 진짜를 눌러 보고 틀리면 가짜로 다시 누르면 되니, 작정하면 그날 공식전을
 * 만점으로 칠 수 있다. 즉시 정답 공개가 설계라 "첫 답에 정답이 드러나는 것"은
 * 막을 수 없다 — 막아야 할 것은 **알고 나서 답을 바꾸는 것**이다.
 *
 * 그래서 거절하지 않고 **첫 답을 최종 답으로 고정**한다. 두 번째부터는 같은
 * 문제의 공개 정보를 그대로 주되 판정은 첫 답 그대로고, 집계에도 넣지 않는다.
 * 409로 막지 않는 이유: 네트워크가 끊겨 같은 요청이 두 번 가는 일이 실제로
 * 있고, 그때 막아 버리면 정직하게 친 사람이 문제를 잃는다.
 *
 * 두 겹으로 센다.
 *   쿠키   서명된 진행 상태. 비회원까지 덮지만 지우면 새 판이 된다
 *   DB     로그인한 사람은 여기에도 남아서 쿠키를 지워도 첫 답이 남는다
 * 비회원의 완전 차단은 이 구조로는 안 된다. 판을 계정에 묶기 전까지는 남는
 * 구멍이고, 순위에 무게를 더 싣기로 하면 그때 정할 일이다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const RUN_COOKIE = "aptgam_run";
/** 자정에 판이 바뀌므로 하루보다 길게 들고 있을 이유가 없다 */
const MAX_AGE = 36 * 3600;

export type Mode = "ox" | "assemble" | "findreal";

/** 답한 번호 비트와 맞힌 번호 비트. 번호는 1~10이라 10비트면 넉넉하다 */
interface Marks {
  a: number;
  c: number;
}
interface RunState {
  /** 이 상태가 어느 날짜의 판인가. 날짜가 바뀌면 통째로 버린다 */
  d: string;
  /** "<mode>|<area>" → 비트. 구역이 다르면 문제가 다르므로 따로 센다 */
  k: Record<string, Marks>;
}

const secret = () => process.env.AUTH_SECRET ?? "";
const b64 = (s: string) => Buffer.from(s).toString("base64url");

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function parse(raw: string | undefined, date: string): RunState {
  const empty: RunState = { d: date, k: {} };
  if (!raw || !secret()) return empty;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return empty;
  const payload = raw.slice(0, dot);
  const got = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  // 길이가 다르면 timingSafeEqual이 던진다. 위조 쿠키를 받는 자리라 먼저 잰다
  if (got.length !== want.length || !timingSafeEqual(got, want)) return empty;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as RunState;
    // 어제 판의 비트를 오늘에 물려주면 첫 문제부터 "이미 답함"이 된다
    if (!s || typeof s !== "object" || s.d !== date || !s.k || typeof s.k !== "object") return empty;
    return s;
  } catch {
    return empty;
  }
}

const serialize = (s: RunState) => {
  const payload = b64(JSON.stringify(s));
  return `${payload}.${sign(payload)}`;
};

const keyOf = (mode: Mode, area: string) => `${mode}|${area}`;

/* ---------- DB ---------- */

/**
 * 로그인한 사람의 첫 답을 남긴다.
 * @returns 처음이면 null, 이미 답했으면 그때의 정오답
 */
async function claimInDb(
  uid: number,
  date: string,
  area: string,
  mode: Mode,
  no: number,
  correct: boolean,
): Promise<boolean | null> {
  if (!sql) return null;
  try {
    const rows = (await sql`
      INSERT INTO official_answer (user_id, date, area, mode, no, correct)
      VALUES (${uid}, ${date}, ${area}, ${mode}, ${no}, ${correct})
      ON CONFLICT (user_id, date, area, mode, no) DO NOTHING
      RETURNING correct`) as { correct: boolean }[];
    if (rows.length > 0) return null; // 처음 들어갔다
    const prev = (await sql`
      SELECT correct FROM official_answer
      WHERE user_id = ${uid} AND date = ${date} AND area = ${area} AND mode = ${mode} AND no = ${no}`) as {
      correct: boolean;
    }[];
    return prev[0]?.correct ?? null;
  } catch {
    // 집계가 흔들려도 게임은 막지 않는다. DB가 없으면 쿠키만으로 센다
    return null;
  }
}

/* ---------- 바깥에서 쓰는 것 ---------- */

export interface ClaimResult {
  /** 이 문제에 처음 답했는가. false면 집계에 넣지 않는다 */
  first: boolean;
  /** 최종으로 인정되는 정오답 (두 번째부터는 첫 답의 값) */
  correct: boolean;
}

/**
 * 공식전 한 문제의 답을 확정한다.
 *
 * 첫 답이면 그대로 인정하고 기록한다. 두 번째부터는 첫 답을 돌려준다 —
 * 답을 바꿔도 판정이 안 바뀌므로 알고 나서 고쳐 봐야 소용이 없다.
 */
export async function claimOfficialAnswer(opts: {
  uid: number | null;
  date: string;
  area: string;
  mode: Mode;
  no: number;
  correct: boolean;
}): Promise<ClaimResult> {
  const { uid, date, area, mode, no, correct } = opts;
  const bit = 1 << (no - 1);

  const store = await cookies();
  const state = parse(store.get(RUN_COOKIE)?.value, date);
  const key = keyOf(mode, area);
  const marks = state.k[key] ?? { a: 0, c: 0 };

  const seenInCookie = (marks.a & bit) !== 0;
  const cookieCorrect = (marks.c & bit) !== 0;

  // 쿠키를 지우고 와도 로그인한 사람은 DB에 첫 답이 남아 있다
  const dbCorrect = uid === null ? null : await claimInDb(uid, date, area, mode, no, correct);

  if (seenInCookie || dbCorrect !== null) {
    const finalCorrect = dbCorrect !== null ? dbCorrect : cookieCorrect;
    // 쿠키가 비어 있었다면(지우고 온 경우) 첫 답으로 다시 채워 둔다
    if (!seenInCookie) writeCookie(store, state, key, marks, bit, finalCorrect);
    return { first: false, correct: finalCorrect };
  }

  writeCookie(store, state, key, marks, bit, correct);
  return { first: true, correct };
}

function writeCookie(
  store: Awaited<ReturnType<typeof cookies>>,
  state: RunState,
  key: string,
  marks: Marks,
  bit: number,
  correct: boolean,
) {
  if (!secret()) return; // 서명할 수 없으면 쿠키를 두지 않는다 (위조를 부르는 꼴이다)
  state.k[key] = { a: marks.a | bit, c: correct ? marks.c | bit : marks.c };
  try {
    store.set(RUN_COOKIE, serialize(state), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
  } catch {
    /* 쿠키를 못 쓰는 자리에서 호출돼도 판정은 그대로 돌아간다 */
  }
}
