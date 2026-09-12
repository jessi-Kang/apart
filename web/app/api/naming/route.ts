import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { blockIfUnreleased } from "@/lib/guard";
import { normalizeArea } from "@/lib/areaparam";
import { judgeName, piecesFor } from "@/lib/naming";
import { saveCoined } from "@/lib/coined";

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

  const verdict = judgeName(name);
  if (body.check === true || !verdict.ok) return NextResponse.json({ verdict });

  const session = await readSession();
  const saved = await saveCoined({ name, area, uid: session?.uid ?? null });
  if (!saved.ok) {
    // 이미 누가 지어 둔 이름과, 저장 자체가 안 된 것은 다른 일이다.
    // 썼는데 안 들어간 것을 들어간 줄 알면 두 번 잃으므로 실패는 그대로 알린다
    if (saved.reason === "duplicate") {
      return NextResponse.json({ verdict: { ok: false, reason: "exists", near: name } });
    }
    return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ verdict, ...saved });
}
