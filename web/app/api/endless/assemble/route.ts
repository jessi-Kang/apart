import { NextResponse } from "next/server";
import { randomAssemble, judgeAssemble } from "@/lib/endless";

export const dynamic = "force-dynamic";

/** 무한 이름 조립: GET = 랜덤 퍼즐(?area=면 그 시·도만), POST = 판정 */
export function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area");
  return NextResponse.json(randomAssemble(area));
}

export async function POST(req: Request) {
  let body: { id?: unknown; guess?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = judgeAssemble(body.id, body.guess);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  return NextResponse.json(result);
}
