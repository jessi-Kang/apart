import { NextResponse } from "next/server";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { assembleForDate } from "@/lib/assemble";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/** 오늘의 조립 10문제. 정답 배열 순서는 포함하지 않는다. */
export function GET(req: Request) {
  const date = kstDateString();
  const area = areaFromUrl(req.url);
  return NextResponse.json(
    { date, episode: episodeNumber(date), area, items: assembleForDate(date, area) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
