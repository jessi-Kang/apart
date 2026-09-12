import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { randomFind, judgeFind } from "@/lib/endless";

export const dynamic = "force-dynamic";

/** 무한 진짜 찾기: GET = 랜덤 4지선다(?area=자치구면 그 구역만), POST = 판정 */
export function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area");
  return NextResponse.json(randomFind(area));
}

export async function POST(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("findreal");
  if (blocked) return blocked;
  let body: { options?: unknown; pick?: unknown; timeout?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = judgeFind(body.options, body.timeout === true ? null : body.pick);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  return NextResponse.json(result);
}
