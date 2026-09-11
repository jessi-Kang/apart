import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 구글 로그인 세션 (서버 전용, 의존성 0).
 * - HMAC-SHA256 서명 쿠키에 {uid, name, exp}만 담는다. 이메일 등 PII는
 *   쿠키에 넣지 않는다.
 * - 필요한 환경변수: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / AUTH_SECRET.
 *   셋 중 하나라도 없으면 로그인 기능 전체가 조용히 꺼진다(비회원만 동작).
 */

export const SESSION_COOKIE = "aptgam_session";
export const STATE_COOKIE = "aptgam_oauth_state";
const SESSION_DAYS = 180;

export interface Session {
  uid: number;
  name: string;
  exp: number; // epoch seconds
}

export function authConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function hmac(data: string): string {
  return b64url(createHmac("sha256", process.env.AUTH_SECRET!).update(data).digest());
}

export function signSession(uid: number, name: string): { token: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = b64url(Buffer.from(JSON.stringify({ uid, name, exp } satisfies Session)));
  return { token: `${payload}.${hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token || !authConfigured()) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const want = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (typeof s.uid !== "number" || typeof s.exp !== "number") return null;
    if (s.exp * 1000 < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** 라우트 핸들러에서 현재 세션을 읽는다 */
export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * 프록시(Vercel) 뒤에서도 올바른 외부 origin을 얻는다.
 *
 * 프로덕션에서는 요청이 어느 주소로 들어왔든 정식 도메인으로 고정한다.
 * 요청 호스트를 그대로 쓰면 베르셀이 만들어 주는 옛 주소로 들어온 사람의
 * redirect_uri가 그 옛 주소로 만들어져 구글이 튕겼다. 미들웨어가 이미 정식
 * 도메인으로 넘기지만, 리디렉션 URI는 한 글자만 어긋나도 로그인이 통째로
 * 막히는 값이라 여기서도 못을 박는다.
 */
export function requestOrigin(req: Request): string {
  if (process.env.VERCEL_ENV === "production") return "https://apt-game.app";
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
