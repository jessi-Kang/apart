import { NextResponse } from "next/server";
import { viewerIsOwner } from "@/lib/release";
import { opsStats } from "@/lib/opsstats";
import { toPeriod } from "@/lib/opsperiod";

export const dynamic = "force-dynamic";

/** 운영 현황 — 운영자만. 못 보는 사람에게는 404로 답한다(있다는 사실도 알리지 않는다) */
export async function GET(req: Request) {
  if (!(await viewerIsOwner())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const period = toPeriod(new URL(req.url).searchParams.get("p"));
  return NextResponse.json(await opsStats(period), { headers: { "Cache-Control": "no-store" } });
}
