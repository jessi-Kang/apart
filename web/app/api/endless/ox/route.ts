import { NextResponse } from "next/server";
import { randomOx, judgeOx } from "@/lib/endless";

export const dynamic = "force-dynamic";

/** 무한 감별: GET = 랜덤 문제, POST = 판정 (집계 미반영) */
export function GET() {
  return NextResponse.json(randomOx());
}

export async function POST(req: Request) {
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
