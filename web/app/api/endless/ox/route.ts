import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { randomOx, judgeOx } from "@/lib/endless";

export const dynamic = "force-dynamic";

/** 무한 감별: GET = 랜덤 문제(?area=자치구면 그 구역만), POST = 판정 (집계 미반영) */
export function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area");
  return NextResponse.json(randomOx(area));
}

export async function POST(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  let body: { name?: unknown; choice?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const nameOk = typeof body.name === "string" && body.name.length <= 30;
  const choiceOk = body.choice === "real" || body.choice === "fake" || body.choice === "timeout";
  if (!nameOk || !choiceOk) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const result = judgeOx(body.name as string, body.choice as "real" | "fake" | "timeout");
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  return NextResponse.json(result);
}
