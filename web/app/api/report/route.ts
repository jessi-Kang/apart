import { NextResponse } from "next/server";
import { readyCount, topFooling, MIN_SHOWN } from "@/lib/namestats";
import { viewerIsOwner } from "@/lib/release";

export const dynamic = "force-dynamic";

/**
 * 감별 리포트: 사람들이 가장 잘 속은 이름들.
 *
 * 아직 전개 전이라 운영자에게만 연다. 표본이 얇을 때 순위를 공개하면
 * 몇 판이 우연히 몰린 이름이 1위가 되고, 그 그림이 먼저 퍼진다.
 */
export async function GET() {
  if (!(await viewerIsOwner())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [real, fake, ready] = await Promise.all([topFooling("real"), topFooling("fake"), readyCount()]);
  return NextResponse.json(
    { real, fake, ready, minShown: MIN_SHOWN },
    { headers: { "Cache-Control": "no-store" } },
  );
}
