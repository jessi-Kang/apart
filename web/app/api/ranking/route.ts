import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { areaFromUrl } from "@/lib/areaparam";
import { areaBoard } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/**
 * 구역 명부: 같은 담당 구역 감별사들의 직급 순위.
 *   /api/ranking?area=부산광역시
 * 구역 값은 areaFromUrl이 거르므로 모르는 값은 전국(빈 문자열)으로 떨어진다.
 * 로그인하지 않았으면 mine은 null이다 — 명부는 누구나 볼 수 있고,
 * 거기 이름을 올리려면 기록을 계정에 보관해야 한다.
 */
export async function GET(req: Request) {
  const area = areaFromUrl(req.url);
  const session = await readSession();
  const board = await areaBoard(area, session?.uid ?? null);
  return NextResponse.json(
    { area, ...board, signedIn: Boolean(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
