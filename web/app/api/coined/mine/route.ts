import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { blockIfUnreleased } from "@/lib/guard";
import { myCoined } from "@/lib/coined";

export const dynamic = "force-dynamic";

/**
 * 내가 지은 이름과 그 성적.
 *
 * 창구가 전개 전이면 주소를 알아도 404다 — 화면(layout)과 데이터(여기)를
 * 같이 막는다는 규칙 그대로다.
 *
 * 비회원에게는 빈 목록을 준다. 접수한 이름은 남지만 누가 지었는지 서버가
 * 모르니 되찾아 줄 수가 없다. 그 사실을 화면이 말할 수 있게 signedIn을 같이 준다.
 */
export async function GET() {
  const blocked = await blockIfUnreleased("naming");
  if (blocked) return blocked;
  const session = await readSession();
  const body = session?.uid
    ? { signedIn: true, ...(await myCoined(session.uid)) }
    : { signedIn: false, accepted: 0, fooled: 0, shown: 0, items: [] };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
