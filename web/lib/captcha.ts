import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 접수 서식을 읽어 옮겨 적는 본인 확인 (의존성 0).
 *
 * 목적은 사람을 가려내는 게 아니라 **자동 제출을 귀찮게 만드는 것**이다.
 * 버그 제보함이 광고로 가득 차지 않을 정도면 된다.
 *
 * 왜 덧셈을 버렸나: "3 + 5 = ?"는 이 서비스 어디에도 없는 말투다. 서류
 * 창구 한가운데에 산수 시험지가 한 장 끼어 있는 꼴이라 화면이 통째로
 * 어설퍼 보였다. 대신 창구에서 실제로 하는 일 — 서식을 보고 칸의 값을
 * 옮겨 적는 것 — 을 그대로 시킨다. 기계 입장에서도 덧셈보다 낫다.
 * 답이 글 안에 숫자로 널려 있고 그중 어느 칸인지 골라야 하기 때문이다.
 *
 * 답을 어디에 두느냐가 핵심이다. 응답 본문이나 숨은 입력칸에 넣으면
 * 그대로 읽어서 채우면 그만이다. 그래서 답은 HttpOnly 쿠키에만 담는다 —
 * 스크립트가 읽을 수 없고, HMAC 서명이라 위조도 안 된다.
 *
 * 그림 문자를 비틀어 놓는 방식은 쓰지 않는다. 눈이 불편한 사람에게
 * 읽을 방법이 없는 관문을 세우는 셈이라, 버그를 알려 주러 온 사람을
 * 돌려보내게 된다. 이 서식은 그냥 글자라 낭독기로도 다 읽힌다.
 */

export const CAPTCHA_COOKIE = "aptgam_captcha";
const TTL_SEC = 600; // 10분. 천천히 쓰는 사람을 내쫓지 않을 만큼

const secret = () => process.env.AUTH_SECRET ?? "";

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export interface CaptchaRow {
  k: string;
  v: number;
}
export interface Captcha {
  rows: CaptchaRow[];
  ask: string;
  token: string;
}

/** 서식에 올릴 수 있는 항목들 — 단지 대장에 실제로 적히는 칸만 쓴다 */
const FIELDS: { k: string; min: number; max: number }[] = [
  { k: "세대수", min: 120, max: 2400 },
  { k: "동수", min: 2, max: 24 },
  { k: "준공년도", min: 1981, max: 2025 },
  { k: "최고층수", min: 5, max: 38 },
  { k: "주차면수", min: 150, max: 2800 },
];

const pick = (n: number) => Math.floor(Math.random() * n);

/** 서식 세 줄과, 그중 물어볼 칸. 답은 서명 토큰에만 담긴다 */
export function makeCaptcha(): Captcha | null {
  if (!secret()) return null;
  const pool = [...FIELDS];
  const rows: CaptchaRow[] = [];
  for (let i = 0; i < 3; i++) {
    const f = pool.splice(pick(pool.length), 1)[0];
    rows.push({ k: f.k, v: f.min + pick(f.max - f.min + 1) });
  }
  const asked = rows[pick(rows.length)];
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = Buffer.from(JSON.stringify({ v: asked.v, exp })).toString("base64url");
  return { rows, ask: asked.k, token: `${payload}.${sign(payload)}` };
}

/** 토큰이 진짜이고 아직 살아 있으며 답이 맞는가 */
export function verifyCaptcha(token: string | undefined, answer: unknown): boolean {
  if (!secret() || !token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const { v, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { v: number; exp: number };
    if (typeof v !== "number" || typeof exp !== "number" || exp * 1000 < Date.now()) return false;
    return Number(answer) === v;
  } catch {
    return false;
  }
}
