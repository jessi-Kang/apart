import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { creditCorrect } from "@/lib/xpbudget";
import { blockIfUnreleased } from "@/lib/guard";
import { judgeAssemble } from "@/lib/endless";
import { applyAnswer, assembleAt, writeRun } from "@/lib/run";
import { endChallenge, openRun, quitChallenge, runForAnswer } from "@/lib/runroute";

export const dynamic = "force-dynamic";

/** 무한 이름 조립. GET = 판 열기·다음 퍼즐(lib/runroute.ts), POST {id, guess} = 판정, POST {end} = 도전 판 끝내기 */
export async function GET(req: Request) {
  const blocked = await blockIfUnreleased("assemble");
  if (blocked) return blocked;
  const run = await openRun(req, "assemble");
  if (run instanceof Response) return run;
  return NextResponse.json({ ...assembleAt(run.s, run.a, run.i), ...(run.p && { practice: true }) });
}

export async function POST(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("assemble");
  if (blocked) return blocked;
  let body: { id?: unknown; guess?: unknown; end?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const run = await runForAnswer("assemble");
  if (run instanceof Response) return run;
  if (body.end === true) return quitChallenge(run, "assemble");

  const q = assembleAt(run.s, run.a, run.i);
  // 지금 판의 퍼즐이 아니면 받지 않는다
  if (body.id !== q.id) return NextResponse.json({ error: "stale" }, { status: 409 });
  const result = judgeAssemble(q.id, body.guess);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (result.correct && !run.p) await creditCorrect((await readSession())?.uid, "assemble");
  const next = applyAnswer(run, result.correct);
  await writeRun(next, "assemble");
  const over = next.e ? await endChallenge(next) : undefined;
  return NextResponse.json({ ...result, ...(over && { over }) });
}
