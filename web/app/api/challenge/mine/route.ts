import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { sentSummary } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** 내가 보낸 도전장 요약 (기록 열람실). 로그인한 사람만 — 비회원 도전장은 보낸 사람을 모른다 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "login_required" }, { status: 401 });
  return NextResponse.json(await sentSummary(session.uid));
}
