import { NextResponse } from "next/server";
import { CAPTCHA_COOKIE, makeCaptcha } from "@/lib/captcha";

export const dynamic = "force-dynamic";

/**
 * 캡챠 문제 발급.
 * 답은 본문이 아니라 HttpOnly 쿠키에만 담는다 — 본문에 실으면 그대로 읽어
 * 채우면 그만이라 아무것도 막지 못한다.
 */
export async function GET() {
  const c = makeCaptcha();
  if (!c) return NextResponse.json({ rows: null, ask: null });
  const res = NextResponse.json({ rows: c.rows, ask: c.ask }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(CAPTCHA_COOKIE, c.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
