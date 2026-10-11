import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { creditCorrect } from "@/lib/xpbudget";
import { blockIfUnreleased } from "@/lib/guard";
import { judgeOx } from "@/lib/endless";
import { recordName } from "@/lib/namestats";
import { normalizeArea } from "@/lib/areaparam";
import { getChallenge, recordTake } from "@/lib/challenge";
import { applyAnswer, newRun, oxAt, readRun, writeRun, type OxRun } from "@/lib/oxrun";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 무한 감별.
 *   GET ?start=1&area=   새 판을 열고 첫 문제
 *   GET ?start=1&c=번호   도전장의 판을 연다 (보낸 사람이 받은 이름이 같은 순서로)
 *   GET                  지금 판의 다음 문제
 *   POST {name, choice}  판정. 판의 진행은 서버가 서명 쿠키로 센다 (lib/oxrun.ts)
 *   POST {end: true}     도전 판을 여기서 끝낸다 (기록을 넘긴 채로 그만두는 경우)
 */
export async function GET(req: Request) {
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  const url = new URL(req.url);
  const prev = await readRun();
  let run = prev;
  if (url.searchParams.get("start") === "1" || !run) {
    const code = url.searchParams.get("c");
    if (code) {
      const ch = await getChallenge(code);
      if (!ch) return NextResponse.json({ error: "not_found" }, { status: 404 });
      run = newRun(prev, { area: ch.area, seed: ch.seed, start: ch.start, code: ch.code, target: ch.target });
    } else {
      run = newRun(prev, { area: normalizeArea(url.searchParams.get("area")) });
    }
    await writeRun(run);
  }
  if (run.e) return NextResponse.json({ error: "ended" }, { status: 409 });
  return NextResponse.json({ name: oxAt(run.s, run.a, run.i).name });
}

async function endChallenge(run: OxRun): Promise<{ mine: number; target: number }> {
  const session = await readSession();
  const ch = run.c ? await getChallenge(run.c) : null;
  // 보낸 사람이 자기 도전장을 쳐 본 것은 받은 사람 결과에 넣지 않는다
  if (ch && !(session && ch.senderUid === session.uid)) {
    await recordTake(ch.code, session ? `u${session.uid}` : `g${run.g}`, run.b);
  }
  return { mine: run.b, target: run.t ?? 0 };
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
  const run = await readRun();
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 409 });
  if (run.e) return NextResponse.json({ error: "ended" }, { status: 409 });

  if (body.end === true) {
    if (!run.c) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const ended: OxRun = { ...run, e: 1 };
    await writeRun(ended);
    return NextResponse.json({ over: await endChallenge(ended) });
  }

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
  // 맞혔으면 경험치 한도를 올린다 (lib/xpbudget.ts)
  if (result.correct) await creditCorrect((await readSession())?.uid, "ox");
  const next = applyAnswer(run, result.correct);
  await writeRun(next);
  const over = next.e ? await endChallenge(next) : undefined;
  return NextResponse.json({ ...result, ...(over && { over }) });
}
