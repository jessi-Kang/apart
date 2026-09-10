import { NextResponse } from "next/server";
import { kstDateString, episodeNumber, quizForDate, itemName } from "@/lib/daily";

export const dynamic = "force-dynamic";

/** 오늘의 10문제. 정답은 절대 포함하지 않는다 (docs/04 §3). */
export function GET() {
  const date = kstDateString();
  const items = quizForDate(date).map((it) => ({ no: it.no, name: itemName(it) }));
  return NextResponse.json(
    { date, episode: episodeNumber(date), items },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
