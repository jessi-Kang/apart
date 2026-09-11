import { NextResponse } from "next/server";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { findRealForDate } from "@/lib/findreal";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/** 오늘의 진짜 찾기 10라운드. 정답 위치는 포함하지 않는다. */
export function GET(req: Request) {
  const date = kstDateString();
  const area = areaFromUrl(req.url);
  return NextResponse.json(
    { date, episode: episodeNumber(date), area, items: findRealForDate(date, area) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
