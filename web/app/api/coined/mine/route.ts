import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { blockIfUnreleased } from "@/lib/guard";
import { myCoined, type CoinSort } from "@/lib/coined";

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
/** 한 번에 내려주는 이름 수. 화면은 처음 몇 개만 받고 "더 보기"로 이어 받는다 */
const MAX_PAGE = 50;
const num = (v: string | null, fallback: number, max: number) => {
  // Number(null)도 Number("")도 0이라, 값이 없는 것과 0을 적어 보낸 것을
  // 먼저 갈라야 한다. 안 그러면 물음표 없는 요청이 limit 0으로 읽힌다
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback;
};

export async function GET(req: Request) {
  const blocked = await blockIfUnreleased("naming");
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  const limit = Math.max(1, num(q.get("limit"), 5, MAX_PAGE));
  const offset = num(q.get("offset"), 0, 100_000);
  // 모르는 정렬 값은 기본값으로 떨어뜨린다. 받은 문자열을 질의에 쓰지 않는다
  const sort: CoinSort = q.get("sort") === "recent" ? "recent" : "fooled";
  const session = await readSession();
  const body = session?.uid
    ? { signedIn: true, limit, offset, sort, ...(await myCoined(session.uid, limit, offset, sort)) }
    : { signedIn: false, limit, offset, sort, accepted: 0, fooled: 0, shown: 0, items: [] };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
