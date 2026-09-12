import { NextResponse } from "next/server";
import { authConfigured, isOwnerEmail, requestOrigin, signSession, SESSION_COOKIE, STATE_COOKIE } from "@/lib/auth";
import { upsertUser } from "@/lib/userdb";

export const dynamic = "force-dynamic";

interface IdTokenPayload {
  sub?: string;
  email?: string;
  name?: string;
}

/** 구글 OAuth 콜백: 코드 교환 → 사용자 upsert → 세션 쿠키 발급 */
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const fail = (why: string) => {
    const res = NextResponse.redirect(`${origin}/?login=${why}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  if (!authConfigured()) return fail("off");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  if (!code || !state || !cookieState || state !== cookieState) return fail("state");

  let payload: IdTokenPayload;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("token");
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) return fail("token");
    // id_token은 구글 토큰 엔드포인트에서 TLS로 직접 받았으므로 서명 재검증 없이 디코드한다
    payload = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString()) as IdTokenPayload;
  } catch {
    return fail("token");
  }
  if (!payload.sub) return fail("token");

  const uid = await upsertUser(payload.sub, payload.email ?? null, payload.name ?? null);
  if (uid === null) return fail("db");

  const name = payload.name || payload.email?.split("@")[0] || "감별사";
  // 운영자 여부는 로그인할 때 한 번만 정한다 — 매 요청마다 DB를 뒤지지 않게
  const { token, maxAge } = signSession(uid, name.slice(0, 40), isOwnerEmail(payload.email));
  const res = NextResponse.redirect(`${origin}/?login=ok`);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
