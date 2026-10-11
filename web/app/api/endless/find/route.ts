import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { creditCorrect } from "@/lib/xpbudget";
import { blockIfUnreleased } from "@/lib/guard";
import { judgeFind } from "@/lib/endless";
import { applyAnswer, findAt, writeRun } from "@/lib/run";
import { endChallenge, openRun, quitChallenge, runForAnswer } from "@/lib/runroute";

export const dynamic = "force-dynamic";

/** 무한 진짜 찾기. GET = 판 열기·다음 4지선다(lib/runroute.ts), POST {pick|timeout} = 판정, POST {end} = 도전 판 끝내기 */
export async function GET(req: Request) {
  const blocked = await blockIfUnreleased("findreal");
  if (blocked) return blocked;
  const run = await openRun(req, "findreal");
  if (run instanceof Response) return run;
  return NextResponse.json({ ...findAt(run.s, run.a, run.i), ...(run.p && { practice: true }) });
}

export async function POST(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("findreal");
  if (blocked) return blocked;
  let body: { pick?: unknown; timeout?: unknown; end?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const run = await runForAnswer("findreal");
  if (run instanceof Response) return run;
  if (body.end === true) return quitChallenge(run, "findreal");

  // 보기는 요청에서 받지 않고 서버가 지금 판의 문제로 다시 만든다 — 보기를 지어 와 판정만 받아 가는 길을 막는다
  const q = findAt(run.s, run.a, run.i);
  const result = judgeFind(q.options, body.timeout === true ? null : body.pick);
  if (!result) return NextResponse.json({ error: "stale" }, { status: 409 });
  if (result.correct && !run.p) await creditCorrect((await readSession())?.uid, "findreal");
  const next = applyAnswer(run, result.correct);
  await writeRun(next, "findreal");
  const over = next.e ? await endChallenge(next) : undefined;
  return NextResponse.json({ ...result, ...(over && { over }) });
}
