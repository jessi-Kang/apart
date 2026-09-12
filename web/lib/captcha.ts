import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 아주 간단한 캡챠 (의존성 0).
 *
 * 목적은 사람을 가려내는 게 아니라 **자동 제출을 귀찮게 만드는 것**이다.
 * 버그 제보함이 광고로 가득 차지 않을 정도면 된다.
 *
 * 답을 어디에 두느냐가 핵심이다. 응답 본문이나 숨은 입력칸에 넣으면
 * 그대로 읽어서 채우면 그만이다. 그래서 답은 HttpOnly 쿠키에만 담는다 —
 * 스크립트가 읽을 수 없고, HMAC 서명이라 위조도 안 된다.
 *
 * 그림 문자를 비틀어 놓는 방식은 쓰지 않는다. 눈이 불편한 사람에게
 * 읽을 방법이 없는 관문을 세우는 셈이라, 버그를 알려 주러 온 사람을
 * 돌려보내게 된다. 한 자리 덧셈이면 그런 문제가 없다.
 */

export const CAPTCHA_COOKIE = "aptgam_captcha";
const TTL_SEC = 600; // 10분. 천천히 쓰는 사람을 내쫓지 않을 만큼

const secret = () => process.env.AUTH_SECRET ?? "";

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export interface Captcha {
  question: string;
  token: string;
}

/** 한 자리 덧셈 문제와, 답이 담긴 서명 토큰 */
export function makeCaptcha(): Captcha | null {
  if (!secret()) return null;
  const a = 2 + Math.floor(Math.random() * 7); // 2~8
  const b = 2 + Math.floor(Math.random() * 7);
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = Buffer.from(JSON.stringify({ v: a + b, exp })).toString("base64url");
  return { question: `${a} + ${b} = ?`, token: `${payload}.${sign(payload)}` };
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
