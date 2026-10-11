import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { poolOf } from "./data";
import { mulberry32 } from "./seeded";

/**
 * 무한 감별 한 판의 진행 상태 (서명 쿠키).
 *
 * 왜 있나. 도전장은 "내가 받은 이름을 같은 순서로" 남에게 보내는 일이다. 예전처럼
 * 문제마다 따로 동전을 던지면 지나간 판을 되살릴 길이 없다. 그래서 판마다 시드를
 * 하나 정하고, n번째 문제는 (시드, n)만으로 정해지게 했다.
 *
 * 판 기록(최고 연속과 그 연속이 시작된 번호)도 여기서 서버가 센다. 도전장에 적히는
 * 기록이 클라이언트가 보낸 숫자면 아무나 "연속 999"를 보낼 수 있다.
 *
 * 남는 것: 쿠키는 브라우저가 들고 있으므로, 스크립트로 이전 쿠키를 되돌려 같은
 * 문제를 다시 답하면 기록을 부풀릴 수 있다. 판을 DB에 두면 닫히지만 문제마다
 * 쓰기가 생긴다 — 순위가 걸린 자리가 아니라서 지금은 쿠키로 둔다.
 */

export const OX_COOKIE = "aptgam_ox";
const MAX_AGE = 30 * 86400;

export interface OxRun {
  /** 시드 */
  s: number;
  /** 구역 (빈 값 = 전국) */
  a: string;
  /** 다음에 낼 문제 번호 (0부터) */
  i: number;
  /** 지금 연속과 그 연속이 시작된 번호 */
  r: number;
  rs: number;
  /** 이 판 최고 연속과 그 연속이 시작된 번호 */
  b: number;
  bs: number;
  /** 이 판에서 맞힌 수 */
  h: number;
  /** 도전장으로 연 판이면 그 번호와 넘을 기록. 이 판은 첫 오답에서 끝난다 */
  c?: string;
  t?: number;
  /** 도전 판이 끝났다 */
  e?: 1;
  /** 답을 이미 아는 판(같은 도전장을 다시 치거나 내 도전장을 쳐 보는 것). 경험치·도전장 발송 없음 */
  p?: 1;
  /** 비회원 도전 기록을 한 사람으로 묶는 임의 값. 판이 바뀌어도 물려준다 */
  g: string;
}

/* AUTH_SECRET이 없는 로컬에서도 판이 돌게 프로세스마다 임의 키를 쓴다(재시작하면 판이 새로 시작된다) */
const LOCAL_KEY = randomBytes(32).toString("base64url");
const secret = () => process.env.AUTH_SECRET || LOCAL_KEY;
const sign = (p: string) => createHmac("sha256", secret()).update(`ox|${p}`).digest("base64url");

function parse(raw: string | undefined): OxRun | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const got = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as OxRun;
    if (!s || typeof s.s !== "number" || typeof s.i !== "number" || typeof s.g !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function readRun(): Promise<OxRun | null> {
  return parse((await cookies()).get(OX_COOKIE)?.value);
}

export async function writeRun(run: OxRun): Promise<void> {
  const payload = Buffer.from(JSON.stringify(run)).toString("base64url");
  (await cookies()).set(OX_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** 새 판. 도전장이면 그 판의 시드·구역·시작 번호를 그대로 받는다 */
export function newRun(prev: OxRun | null, opts: { area: string; seed?: number; start?: number; code?: string; target?: number; practice?: boolean }): OxRun {
  const start = opts.start ?? 0;
  return {
    s: opts.seed ?? randomBytes(4).readUInt32LE(0),
    a: opts.area,
    i: start,
    r: 0,
    rs: start,
    b: 0,
    bs: start,
    h: 0,
    ...(opts.code && { c: opts.code, t: opts.target ?? 0 }),
    ...(opts.practice && { p: 1 as const }),
    g: prev?.g ?? randomBytes(6).toString("base64url"),
  };
}

/* ---------- 출제 ---------- */

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * n번째 문제가 진짜인가. 같은 쪽이 셋 이상 이어지면 반대쪽 확률을 0.8로 올리는
 * 규칙(가짜만 줄줄이 나와 "AI가 지은 것밖에 없나" 싶던 것을 막은 것)을 그대로
 * 따르되, 앞 문제들의 정체도 시드에서 나오므로 처음부터 다시 굴려 본다.
 */
function kindsUpTo(seed: number, n: number): boolean[] {
  const rnd = mulberry32(seed);
  const out: boolean[] = [];
  for (let k = 0; k <= n; k++) {
    let run = 0;
    for (let j = out.length - 1; j >= 0 && out[j] === out[out.length - 1]; j--) run++;
    let pReal = 0.5;
    if (run >= 3) pReal = out[out.length - 1] ? 0.2 : 0.8;
    out.push(rnd() < pReal);
  }
  return out;
}

/**
 * n번째 이름. 풀에서 (시드, n, 이름)의 해시가 가장 작은 것을 고른다.
 * 풀은 매일 밤 늘어나는데, 배열 위치로 고르면 하나만 늘어도 뒤가 다 밀려 받은
 * 도전장이 다른 문제가 된다. 해시 최솟값은 새로 든 이름이 이길 때만 바뀐다.
 */
export function oxAt(seed: number, area: string, n: number): { name: string; real: boolean } {
  const real = kindsUpTo(seed, n)[n];
  const { reals, fakes } = poolOf(area || null);
  const pool: { name: string }[] = real ? reals : fakes;
  const salt = `${seed}:${n}:`;
  let best = pool[0];
  let bh = Infinity;
  for (const p of pool) {
    const h = hash32(salt + p.name);
    if (h < bh) {
      bh = h;
      best = p;
    }
  }
  return { name: best.name, real };
}

/** 한 문제를 반영한다. 도전 판은 첫 오답에서 끝난다 */
export function applyAnswer(run: OxRun, correct: boolean): OxRun {
  const next = { ...run, i: run.i + 1 };
  if (correct) {
    next.h = run.h + 1;
    next.r = run.r + 1;
    if (next.r > run.b) {
      next.b = next.r;
      next.bs = run.rs;
    }
  } else {
    next.r = 0;
    next.rs = run.i + 1;
    if (run.c) next.e = 1;
  }
  return next;
}
