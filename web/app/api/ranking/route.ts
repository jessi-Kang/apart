import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { areaFromUrl } from "@/lib/areaparam";
import { areaBoard } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/**
 * 구역 명부: 그 구역에서 친 기록이 있는 사람들의 순위.
 *   /api/ranking?area=부산광역시
 * 구역 값은 areaFromUrl이 거르므로 모르는 값은 전국(빈 문자열)으로 떨어진다.
 *
 * 로그인하지 않았으면 mine은 null이다. 비회원 기록은 기기에만 있어서
 * 서버가 줄을 세울 수가 없다 — 명부는 볼 수 있지만 이름은 오르지 않는다.
 * 화면은 그 경우 자기 기기 점수를 대신 보여준다.
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
