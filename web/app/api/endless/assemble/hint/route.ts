import { NextResponse } from "next/server";
import { assembleHintById } from "@/lib/endless";
import { parseFilled } from "@/lib/hangul";

export const dynamic = "force-dynamic";

/** 무한 조립의 초성 힌트 */
export function GET(req: Request) {
  const url = new URL(req.url);
  // 이미 채운 칸은 건너뛰고 빈 칸부터 연다
  const hint = assembleHintById(
    url.searchParams.get("id"),
    Number(url.searchParams.get("tier")),
    parseFilled(url.searchParams.get("filled")),
  );
  if (!hint) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(hint, { headers: { "Cache-Control": "no-store" } });
}
