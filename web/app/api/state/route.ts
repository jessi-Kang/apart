import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getUserState, mergeUserState } from "@/lib/userdb";
import { myCoinTotals } from "@/lib/coined";
import { sanitizeState, type SyncState } from "@/lib/sync";

/**
 * 작명 건수를 서버가 채워 넣는다.
 *
 * user_state에 담아 두지 않는 이유: 그러면 값이 두 벌이 되고 승인·반려로
 * coined_name이 바뀔 때마다 어긋난다. 셀 곳이 이미 있으니 내려보낼 때 센다.
 * DB가 없거나 흔들리면 칸을 비운 채 내려보낸다 — 0을 적어 보내면 화면이
 * "접수 전"으로 되돌아가 있던 기록을 지운 것처럼 보인다.
 */
async function withCoined(uid: number, state: SyncState | null): Promise<SyncState | null> {
  try {
    const { accepted } = await myCoinTotals(uid);
    if (!accepted) return state;
    return { ...(state ?? { v: 1 as const }), coined: accepted };
  } catch {
    return state;
  }
}

export const dynamic = "force-dynamic";

/** 서버에 보관 중인 내 기록 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = await withCoined(session.uid, await getUserState(session.uid));
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
  return NextResponse.json({ state: await withCoined(session.uid, merged) });
}
