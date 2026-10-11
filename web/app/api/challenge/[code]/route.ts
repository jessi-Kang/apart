import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { getChallenge } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** 도전장 겉면. 시드와 시작 번호는 내주지 않는다 (판을 미리 굴려 볼 수 있다) */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const ch = await getChallenge((await params).code);
  if (!ch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // 전개 전 창구의 도전장은 없는 것으로 답한다
  const blocked = await blockIfUnreleased(ch.mode);
  if (blocked) return blocked;
  return NextResponse.json({ code: ch.code, mode: ch.mode, target: ch.target, label: ch.label, area: ch.area });
}
