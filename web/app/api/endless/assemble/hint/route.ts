import { NextResponse } from "next/server";
import { assembleHintById } from "@/lib/endless";

export const dynamic = "force-dynamic";

/** 무한 조립의 초성 힌트 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const hint = assembleHintById(url.searchParams.get("id"), Number(url.searchParams.get("tier")));
  if (!hint) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(hint, { headers: { "Cache-Control": "no-store" } });
}
