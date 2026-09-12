import { NextResponse } from "next/server";
import { viewerIsOwner } from "@/lib/release";
import { recentCoined } from "@/lib/coined";

export const dynamic = "force-dynamic";

/** 접수된 작명 목록 — 운영자만. 승인 전이라 아직 출제되지 않은 이름들이다 */
export async function GET() {
  if (!(await viewerIsOwner())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ coined: await recentCoined() }, { headers: { "Cache-Control": "no-store" } });
}
