import { NextResponse } from "next/server";
import { kstDateString } from "@/lib/daily";
import { recordEndlessRun, RUN_MODES, type RunMode } from "@/lib/runstats";

export const dynamic = "force-dynamic";

const int = (x: unknown, max: number) =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : null;

/** 무한 세션 종료 접수: 판 기록을 집계하고 최근 7일 상위 %를 돌려준다 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const mode = body.mode as RunMode;
  const best = int(body.best, 500);
  const hits = int(body.hits, 1000);
  const count = int(body.count, 1000);
  const avgMs = body.avgMs === null ? null : int(body.avgMs, 600_000);
  if (!RUN_MODES.includes(mode) || best === null || hits === null || count === null || count < 1 || hits > count || best > hits) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await recordEndlessRun(mode, kstDateString(), { best, hits, count, avgMs });
  return NextResponse.json(res);
}
