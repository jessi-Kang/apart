import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getUserState, mergeUserState } from "@/lib/userdb";
import { sanitizeState } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** 서버에 보관 중인 내 기록 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = await getUserState(session.uid);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}

/** 기기 기록 올리기: 서버 보관본과 병합해 저장 (세션 쿠키는 SameSite=Lax라 CSRF 안전) */
export async function PUT(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > 8192) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const merged = await mergeUserState(session.uid, sanitizeState(body));
  if (!merged) return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
  return NextResponse.json({ state: merged });
}
