import { NextResponse } from "next/server";
import { kstDateString } from "@/lib/daily";
import { recordFinish, topPercent } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** 완주 집계: 점수 분포 +1, 상위 % 반환 (표본 미달 시 null) */
export async function POST(req: Request) {
  let body: { date?: string; score?: number };
  try {
    body = (await req.json()) as { date?: string; score?: number };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const today = kstDateString();
  if (body.date !== today || !Number.isInteger(body.score) || body.score! < 0 || body.score! > 10) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  await recordFinish(today, body.score!);
  const { top, sample } = await topPercent(today, body.score!);
  return NextResponse.json({ top, sample });
}
