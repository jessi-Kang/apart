import { NextResponse } from "next/server";
import { rankAmongRuns, RUN_MODES, type RunMode } from "@/lib/runstats";
import { kstDateString } from "@/lib/daily";
import { topPercent } from "@/lib/stats";
import { areaFromUrl } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/**
 * 기록 열람실 집계.
 * 개인 기록은 기기(또는 계정)에 있으므로, 서버는 "내 기록이 남들 사이에서
 * 어디쯤인가"만 돌려준다. 쿼리로 받은 값은 익명 비교에만 쓰고 저장하지 않는다.
 *   /api/records?ox=12&assemble=5&findreal=7&score=8
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const int = (key: string): number | null => {
    const raw = url.searchParams.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.floor(n) : null;
  };

  const endless: Record<string, { top: number | null; sample: number } | null> = {};
  await Promise.all(
    RUN_MODES.map(async (mode: RunMode) => {
      const best = int(mode);
      endless[mode] = best === null ? null : await rankAmongRuns(mode, best);
    }),
  );

  const score = int("score");
  const daily =
    score === null ? null : await topPercent(kstDateString(), score, 100, areaFromUrl(req.url)).catch(() => null);

  return NextResponse.json(
    { endless, daily },
    { headers: { "Cache-Control": "no-store" } },
  );
}
