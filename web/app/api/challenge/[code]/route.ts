import { NextResponse } from "next/server";
import { blockIfUnreleased } from "@/lib/guard";
import { getChallenge } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** 도전장 겉면. 시드와 시작 번호는 내주지 않는다 (판을 미리 굴려 볼 수 있다) */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  const ch = await getChallenge((await params).code);
  if (!ch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ code: ch.code, target: ch.target, label: ch.label, area: ch.area });
}
