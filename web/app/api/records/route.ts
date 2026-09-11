import { NextResponse } from "next/server";
import { rankAmongRuns, RUN_MODES, type RunMode } from "@/lib/runstats";
import { kstDateString } from "@/lib/daily";
import { topPercent, MODES, type Mode } from "@/lib/stats";
import { areaFromUrl, normalizeArea } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

/**
 * 기록 열람실 집계.
 * 개인 기록은 기기(또는 계정)에 있으므로, 서버는 "내 기록이 남들 사이에서
 * 어디쯤인가"만 돌려준다. 쿼리로 받은 값은 익명 비교에만 쓰고 저장하지 않는다.
 *   /api/records?ox=12&assemble=5&findreal=7&d_ox=8&d_assemble=6&area=서울특별시
 * endless.* = 무한 판 순위, daily.* = 그날 그 구역 그 창구의 공식전 순위.
 * 공식전은 창구마다 문제가 다르므로 순위도 창구별로 따로 낸다.
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

  // 공식전 순위는 창구별로 따로 낸다 (d_ox=8&a_ox=서울특별시&d_assemble=6…).
  // 창구마다 그때 고른 구역이 다를 수 있어 구역도 창구별로 받는다.
  const area = areaFromUrl(req.url);
  const today = kstDateString();
  const daily: Record<string, { top: number | null; sample: number } | null> = {};
  await Promise.all(
    MODES.map(async (mode: Mode) => {
      const score = int(`d_${mode}`);
      const modeArea = normalizeArea(url.searchParams.get(`a_${mode}`) ?? area);
      daily[mode] =
        score === null ? null : await topPercent(today, score, 100, modeArea, mode).catch(() => null);
    }),
  );

  return NextResponse.json(
    { endless, daily, area },
    { headers: { "Cache-Control": "no-store" } },
  );
}
