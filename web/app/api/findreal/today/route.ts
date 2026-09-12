import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { findRealForDate } from "@/lib/findreal";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/** 오늘의 진짜 찾기 10라운드. 정답 위치는 포함하지 않는다. */
export async function GET(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("findreal");
  if (blocked) return blocked;
  const date = kstDateString();
  const area = areaFromUrl(req.url);
  return NextResponse.json(
    { date, episode: episodeNumber(date), area, items: findRealForDate(date, area) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
