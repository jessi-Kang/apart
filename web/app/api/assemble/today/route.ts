import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { assembleForDate } from "@/lib/assemble";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/** 오늘의 조립 10문제. 정답 배열 순서는 포함하지 않는다. */
export async function GET(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("assemble");
  if (blocked) return blocked;
  const date = kstDateString();
  const area = areaFromUrl(req.url);
  return NextResponse.json(
    { date, episode: episodeNumber(date), area, items: assembleForDate(date, area) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
