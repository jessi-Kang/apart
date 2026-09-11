import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authConfigured, requestOrigin, STATE_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 구글 OAuth 시작: state 쿠키를 심고 동의 화면으로 보낸다 */
export function GET(req: Request) {
  const origin = requestOrigin(req);
  if (!authConfigured()) return NextResponse.redirect(`${origin}/?login=off`);

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
