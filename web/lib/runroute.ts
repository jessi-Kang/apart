import { NextResponse } from "next/server";
import { readSession } from "./auth";
import { normalizeArea } from "./areaparam";
import { getChallenge, hasTaken, recordTake } from "./challenge";
import { newRun, readRun, writeRun, type Run, type RunMode } from "./run";

/**
 * 무한 판 라우트 셋(감별·찾기·조립)이 같이 쓰는 걸음.
 *   GET ?start=1&area=   새 판
 *   GET ?start=1&c=번호   도전장의 판 (보낸 사람이 받은 문제가 같은 순서로)
 *   GET                  지금 판의 다음 문제
 * 판의 진행과 기록은 서버가 서명 쿠키로 센다(lib/run.ts). 문제는 (시드, n)으로 정해진다.
 */
export async function openRun(req: Request, mode: RunMode): Promise<Run | Response> {
  const url = new URL(req.url);
  const prev = await readRun(mode);
  let run = prev;
  if (url.searchParams.get("start") === "1" || !run) {
    const code = url.searchParams.get("c");
    if (code) {
      const ch = await getChallenge(code);
      if (!ch || ch.mode !== mode) return NextResponse.json({ error: "not_found" }, { status: 404 });
      // 답을 이미 아는 판: 같은 도전장을 다시 치거나, 보낸 사람이 자기 도전장을 쳐 보는 것.
      // 화면은 똑같이 돌지만 경험치를 주지 않고 그 기록으로 도전장도 못 보낸다 —
      // 아는 문제를 되풀이해 경험치와 명부 순위를 쌓는 길이 된다
      const session = await readSession();
      const taker = session ? `u${session.uid}` : `g${prev?.g ?? ""}`;
      const practice = Boolean(session && ch.senderUid === session.uid) || (prev ? await hasTaken(ch.code, taker) : false);
      run = newRun(prev, { area: ch.area, seed: ch.seed, start: ch.start, code: ch.code, target: ch.target, practice });
    } else {
      run = newRun(prev, { area: normalizeArea(url.searchParams.get("area")) });
    }
    await writeRun(run, mode);
  }
  if (run.e) return NextResponse.json({ error: "ended" }, { status: 409 });
  return run;
}

/** 답을 받을 판. 없거나 끝났으면 응답을 돌려준다 */
export async function runForAnswer(mode: RunMode): Promise<Run | Response> {
  const run = await readRun(mode);
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 409 });
  if (run.e) return NextResponse.json({ error: "ended" }, { status: 409 });
  return run;
}

/** 도전 판의 끝. 받은 사람 결과를 남긴다(한 사람의 첫 판만, 답을 아는 판은 빼고) */
export async function endChallenge(run: Run): Promise<{ mine: number; target: number }> {
  const session = await readSession();
  const ch = run.c ? await getChallenge(run.c) : null;
  if (ch && !run.p && !(session && ch.senderUid === session.uid)) {
    await recordTake(ch.code, session ? `u${session.uid}` : `g${run.g}`, run.b);
  }
  return { mine: run.b, target: run.t ?? 0 };
}

/** POST {end: true}: 도전 판을 여기서 끝낸다 (기록을 넘긴 채로 그만두는 경우) */
export async function quitChallenge(run: Run, mode: RunMode): Promise<Response> {
  if (!run.c) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const ended: Run = { ...run, e: 1 };
  await writeRun(ended, mode);
  return NextResponse.json({ over: await endChallenge(ended) });
}
