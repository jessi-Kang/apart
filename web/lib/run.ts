import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { assemblePoolOf, poolOf } from "./data";
import { mulberry32 } from "./seeded";
import { decoyPoolOf, usableDecoys } from "./decoy";

/**
 * 무한 판의 진행 상태 (서명 쿠키, 창구마다 하나).
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

/** 판 기록은 창구마다 따로 둔다. 감별을 치다 조립으로 가도 감별 판이 지워지지 않게 */
export type RunMode = "ox" | "findreal" | "assemble";
export const RUN_MODES: RunMode[] = ["ox", "findreal", "assemble"];
export const isRunMode = (x: unknown): x is RunMode => RUN_MODES.includes(x as RunMode);
const COOKIE: Record<RunMode, string> = { ox: "aptgam_ox", findreal: "aptgam_fr", assemble: "aptgam_as" };
const MAX_AGE = 30 * 86400;

export interface Run {
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
/* 서명에 창구를 섞는다. 감별 쿠키를 조립 쿠키 자리에 옮겨 넣어도 통하지 않게 */
const sign = (p: string, mode: RunMode) => createHmac("sha256", secret()).update(`${mode}|${p}`).digest("base64url");

function parse(raw: string | undefined, mode: RunMode): Run | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const got = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(sign(payload, mode));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Run;
    if (!s || typeof s.s !== "number" || typeof s.i !== "number" || typeof s.g !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function readRun(mode: RunMode): Promise<Run | null> {
  return parse((await cookies()).get(COOKIE[mode])?.value, mode);
}

export async function writeRun(run: Run, mode: RunMode): Promise<void> {
  const payload = Buffer.from(JSON.stringify(run)).toString("base64url");
  (await cookies()).set(COOKIE[mode], `${payload}.${sign(payload, mode)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** 새 판. 도전장이면 그 판의 시드·구역·시작 번호를 그대로 받는다 */
export function newRun(prev: Run | null, opts: { area: string; seed?: number; start?: number; code?: string; target?: number; practice?: boolean }): Run {
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
 * 이름마다 겉모양 무게가 있어 그만큼 잘 뽑힌다(lib/balance.ts).
 */
export function oxAt(seed: number, area: string, n: number): { name: string; real: boolean } {
  const real = kindsUpTo(seed, n)[n];
  const pool = poolOf(area || null);
  const best = real
    ? smallest(pool.reals, `${seed}:${n}:`, 1, (a) => a.name, (a) => pool.realW.get(a) ?? 1)[0]
    : smallest(pool.fakes, `${seed}:${n}:`, 1, (f) => f.name, (f) => pool.fakeW.get(f) ?? 1)[0];
  return { name: best.name, real };
}

/**
 * 풀에서 (salt+이름) 해시로 k개. 풀이 늘어도 새로 든 것이 이길 때만 바뀐다.
 * 무게가 있으면 해시를 0~1로 펴 −ln(u)/무게가 작은 순으로 고른다 — 무게에 비례해
 * 뽑히는 지수 경주다. 무게가 모두 1이면 해시 최솟값과 순서가 같다.
 */
function smallest<T>(pool: T[], salt: string, k: number, key: (t: T) => string, weight?: (t: T) => number): T[] {
  const top: { h: number; t: T }[] = [];
  for (const t of pool) {
    const raw = hash32(salt + key(t));
    const h = weight ? -Math.log((raw + 0.5) / 4294967296) / weight(t) : raw;
    if (top.length < k) {
      top.push({ h, t });
      top.sort((x, y) => x.h - y.h);
    } else if (h < top[k - 1].h) {
      top[k - 1] = { h, t };
      top.sort((x, y) => x.h - y.h);
    }
  }
  return top.map((x) => x.t);
}

/** (시드, n)으로 섞는다. 같은 도전장이면 보기 순서도 같아야 한다 */
function shuffleAt<T>(arr: T[], seed: number, n: number): T[] {
  const rnd = mulberry32((seed ^ Math.imul(n + 1, 2654435761)) >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 진짜 찾기 n번째: 진짜 하나 + 가짜 셋 */
export function findAt(seed: number, area: string, n: number): { options: string[] } {
  const pool = poolOf(area || null);
  const real = smallest(pool.reals, `${seed}:${n}:r:`, 1, (a) => a.name, (a) => pool.realW.get(a) ?? 1)[0];
  const three = smallest(pool.fakes, `${seed}:${n}:f:`, 3, (f) => f.name, (f) => pool.fakeW.get(f) ?? 1).map((f) => f.name);
  return { options: shuffleAt([real.name, ...three], seed, n) };
}

/** 이름 조립 n번째: 진짜 단지 하나를 조각으로, 가짜에서 미끼 조각을 섞는다 */
export function assembleAt(seed: number, area: string, n: number) {
  const pool = assemblePoolOf(area || null);
  const apt = smallest(pool.reals, `${seed}:${n}:a:`, 1, (a) => a.name)[0];
  const answer = apt.name.split(" ");
  const dp = decoyPoolOf(area || null);
  const decoys = smallest(usableDecoys(dp.tokens, answer), `${seed}:${n}:d:`, answer.length >= 3 ? 2 : 3, (t) => t, (t) => dp.weight.get(t) ?? 1);
  return {
    id: apt.id,
    pieces: shuffleAt([...answer, ...decoys], seed, n),
    answerLen: answer.length,
    hint: { location: `${apt.sido} ${apt.sigungu} ${apt.dong}`, builtYear: apt.builtYear, households: apt.households },
    /** 실제로 좁힌 범위. 자치구를 골라도 조립은 그 시·도로 넓히므로 화면이 이 값을 쓴다 */
    sido: pool.sido,
  };
}

/** 한 문제를 반영한다. 도전 판은 첫 오답에서 끝난다 */
export function applyAnswer(run: Run, correct: boolean): Run {
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
