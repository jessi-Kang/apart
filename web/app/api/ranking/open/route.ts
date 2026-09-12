import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { normalizeArea } from "@/lib/areaparam";
import { openAreas } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/**
 * 내가 볼 수 있는 명부 중 열린 것이 있는가.
 *   /api/ranking/open?areas=서울특별시,부산광역시,
 * 홈의 명부 입구를 보일지 정하는 데 쓴다. 잠긴 명부로 가는 링크를 두면
 * 눌러 보고 나서야 볼 게 없다는 걸 알게 된다.
 *
 * 빈 항목은 전국을 뜻한다(구역을 안 고른 채 친 기록).
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("areas") ?? "";
  const asked = raw.split(",").slice(0, 20).map((a) => normalizeArea(a));
  // 운영자에게는 사람이 모이기 전에도 입구를 보인다
  const session = await readSession();
  const open = await openAreas(asked, Boolean(session?.own));
  return NextResponse.json({ open }, { headers: { "Cache-Control": "no-store" } });
}
