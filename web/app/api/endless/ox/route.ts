import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { creditCorrect } from "@/lib/xpbudget";
import { blockIfUnreleased } from "@/lib/guard";
import { judgeOx } from "@/lib/endless";
import { recordName } from "@/lib/namestats";
import { applyAnswer, oxAt, writeRun } from "@/lib/run";
import { endChallenge, openRun, quitChallenge, runForAnswer } from "@/lib/runroute";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 무한 감별. GET = 판 열기·다음 문제(lib/runroute.ts), POST {name, choice} = 판정, POST {end} = 도전 판 끝내기 */
export async function GET(req: Request) {
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  const run = await openRun(req, "ox");
  if (run instanceof Response) return run;
  return NextResponse.json({ name: oxAt(run.s, run.a, run.i).name, ...(run.p && { practice: true }) });
}

export async function POST(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  let body: { name?: unknown; choice?: unknown; end?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const run = await runForAnswer("ox");
  if (run instanceof Response) return run;
  if (body.end === true) return quitChallenge(run, "ox");

  const nameOk = typeof body.name === "string" && body.name.length <= 30;
  const choiceOk = body.choice === "real" || body.choice === "fake" || body.choice === "timeout";
  if (!nameOk || !choiceOk) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const q = oxAt(run.s, run.a, run.i);
  // 화면에 떠 있는 문제와 서버의 문제가 다르면 받지 않는다. 남의 이름을 들고 와 판정만 받아 가는 길을 막는다
  if (norm(body.name as string) !== norm(q.name)) return NextResponse.json({ error: "stale" }, { status: 409 });
  const choice = body.choice as "real" | "fake" | "timeout";
  const result = judgeOx(q.name, choice);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  // 이름별 집계는 무한에서 가장 많이 쌓인다 — 무한이 본편이라 표본의 대부분이 여기다.
  // 시간 초과는 판단이 아니라 판단하지 못한 것이므로 속았다고 세지 않는다
  if (choice !== "timeout") await recordName(q.name, result.kind, !result.correct);
  // 맞혔으면 경험치 한도를 올린다 (lib/xpbudget.ts). 답을 아는 판은 빼고
  if (result.correct && !run.p) await creditCorrect((await readSession())?.uid, "ox");
  const next = applyAnswer(run, result.correct);
  await writeRun(next, "ox");
  const over = next.e ? await endChallenge(next) : undefined;
  return NextResponse.json({ ...result, ...(over && { over }) });
}
