import { NextResponse } from "next/server";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { findRealForDate } from "@/lib/findreal";

export const dynamic = "force-dynamic";

/** 오늘의 진짜 찾기 3라운드. 정답 위치는 포함하지 않는다. */
export function GET() {
  const date = kstDateString();
  return NextResponse.json(
    { date, episode: episodeNumber(date), items: findRealForDate(date) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
