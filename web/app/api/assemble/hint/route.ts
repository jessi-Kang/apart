import { NextResponse } from "next/server";
import { assembleHint } from "@/lib/assemble";
import { parseFilled } from "@/lib/hangul";
import { kstDateString } from "@/lib/daily";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/** 시간 경과 초성 힌트. 정답 전체를 유추할 수 없게 최대 3글자까지만 연다 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const no = Number(url.searchParams.get("no"));
  const tier = Number(url.searchParams.get("tier"));
  // 이미 채운 칸(filled=0,2)은 건너뛰고 빈 칸부터 연다
  const filled = parseFilled(url.searchParams.get("filled"));
  const hint = assembleHint(kstDateString(), no, tier, areaFromUrl(req.url), filled);
  if (!hint) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(hint, { headers: { "Cache-Control": "no-store" } });
}
