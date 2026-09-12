import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { kstDateString, episodeNumber, quizForDate, itemName } from "@/lib/daily";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/** 오늘의 10문제. 정답은 절대 포함하지 않는다 (docs/04 §3). */
export async function GET(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  const date = kstDateString();
  const area = areaFromUrl(req.url);
  const items = quizForDate(date, area).map((it) => ({ no: it.no, name: itemName(it) }));
  return NextResponse.json(
    { date, episode: episodeNumber(date), area, items },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
