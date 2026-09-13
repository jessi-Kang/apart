import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { blockIfUnreleased } from "@/lib/guard";
import { normalizeArea } from "@/lib/areaparam";
import { judgeName, piecesFor } from "@/lib/naming";
import { myCoinTotals, saveCoined, todayCount, SUBMIT_PER_DAY } from "@/lib/coined";

export const dynamic = "force-dynamic";

/** 그 구역에서 쓸 조각들. 실단지 목록 자체는 내려가지 않는다 */
export async function GET(req: Request) {
  const blocked = await blockIfUnreleased("naming");
  if (blocked) return blocked;
  const area = normalizeArea(new URL(req.url).searchParams.get("area"));
  const groups = piecesFor(area);
  if (!groups) return NextResponse.json({ error: "area_required" }, { status: 400 });
  return NextResponse.json({ area, groups }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * 지은 이름 접수.
 *   check = true  판정만 한다 (짓는 도중 확인)
 *   check 없음     판정 후 통과하면 저장한다
 *
 * 실단지 대조는 서버에서만 한다 — 목록을 내려주면 그것으로 감별 창구의
 * 답을 맞출 수 있다.
 */
export async function POST(req: Request) {
  const blocked = await blockIfUnreleased("naming");
  if (blocked) return blocked;
  let body: { name?: unknown; area?: unknown; check?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const area = normalizeArea(body.area);
  if (!area) return NextResponse.json({ error: "area_required" }, { status: 400 });

  /**
   * 작명소는 로그인한 사람만 쓴다.
   *
   * 감별 셋은 비회원도 친다. 거기는 **소비**라 남에게 나가는 것이 없다.
   * 작명은 **생산**이다 — 지은 이름이 자동 승인을 거쳐 남들의 문제로 나간다.
   * 셋이 걸려 있다.
   *   약속   "몇 명이 속았는지 알려 드린다"는 약속은 누가 지었는지 알아야 지킨다.
   *          비회원이 지은 이름은 user_id가 비어 되찾아 줄 길이 없다.
   *   상한   계정이 없으면 하루 몇 건인지 셀 수가 없다. 실제로 비회원은 무제한
   *          이었고, 자동 출제가 붙은 뒤로는 그게 곧장 출제 풀로 흘러갔다.
   *   책임   공개되는 콘텐츠라 누가 넣었는지 남아야 한다.
   */
  const session = await readSession();
  if (!session?.uid) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const verdict = judgeName(name);
  if (body.check === true || !verdict.ok) return NextResponse.json({ verdict });

  // 점수 상한(AWARD_PER_DAY)은 점수만 막는다. 접수 자체에도 상한이 있어야
  // 점수를 포기하고 쏟아붓는 길이 막힌다
  const today = await todayCount(session.uid);
  if (today >= SUBMIT_PER_DAY) {
    return NextResponse.json(
      { error: "daily_limit", limit: SUBMIT_PER_DAY },
      { status: 429 },
    );
  }
  // 통과한 이름은 바로 승인된다. 걸린 말이 있으면 사유를 달아 대기로 보낸다
  const saved = await saveCoined({
    name,
    area,
    uid: session.uid,
    // 어느 갈래에 걸렸는지 그대로 남긴다. "보류"라고만 적어 두면 심사할 때
    // 왜 걸렸는지 이름을 다시 뜯어봐야 한다
    hold: verdict.ok && verdict.screen === "review" ? (verdict.group ?? "확인 필요") : "",
  });
  if (!saved.ok) {
    // 이미 누가 지어 둔 이름과, 저장 자체가 안 된 것은 다른 일이다.
    // 썼는데 안 들어간 것을 들어간 줄 알면 두 번 잃으므로 실패는 그대로 알린다
    if (saved.reason === "duplicate") {
      return NextResponse.json({ verdict: { ok: false, reason: "exists", near: name } });
    }
    return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
  }
  // 접수하자마자 작명 호칭이 어디까지 왔는지 보여준다. 호칭은 감별 직급과
  // 갈라진 축이라(lib/coinlevel.ts) 이 숫자를 화면이 따로 받아야 한다
  const mine = await myCoinTotals(session.uid);
  return NextResponse.json({ verdict, ...saved, mine });
}
