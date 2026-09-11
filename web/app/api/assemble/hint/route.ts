import { NextResponse } from "next/server";
import { assembleHint } from "@/lib/assemble";
import { kstDateString } from "@/lib/daily";

export const dynamic = "force-dynamic";

/** 시간 경과 초성 힌트. 정답 전체를 유추할 수 없게 최대 3글자까지만 연다 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const no = Number(url.searchParams.get("no"));
  const tier = Number(url.searchParams.get("tier"));
  const hint = assembleHint(kstDateString(), no, tier);
  if (!hint) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(hint, { headers: { "Cache-Control": "no-store" } });
}
