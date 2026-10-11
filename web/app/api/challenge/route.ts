import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { blockIfUnreleased } from "@/lib/guard";
import { createChallenge, maskName } from "@/lib/challenge";
import { isRunMode, readRun } from "@/lib/run";

export const dynamic = "force-dynamic";

/**
 * 도전장을 만든다. 기록은 요청에서 받지 않고 서버가 센 이 판의 최고 연속을 쓴다 —
 * 숫자를 받아 주면 아무나 "연속 99"짜리 도전장을 만든다.
 * 도전장의 문제는 그 최고 연속이 시작된 번호부터 나온다. 보낸 사람이 끊기지 않고
 * 맞힌 바로 그 구간을 받는 사람도 같은 조건(첫 오답에서 끝)으로 친다.
 */
export async function POST(req: Request) {
  // 어느 창구의 판인가. 몸이 비었으면 감별(도전장이 감별에만 있던 때의 화면)
  let mode: unknown = "ox";
  try {
    mode = ((await req.json()) as { mode?: unknown }).mode ?? "ox";
  } catch {
    /* 빈 몸 */
  }
  if (!isRunMode(mode)) return NextResponse.json({ error: "bad_mode" }, { status: 400 });
  const blocked = await blockIfUnreleased(mode);
  if (blocked) return blocked;
  const run = await readRun(mode);
  if (!run || run.b < 1) return NextResponse.json({ error: "no_record" }, { status: 400 });
  // 답을 보고 친 판의 기록은 도전장에 싣지 않는다
  if (run.p) return NextResponse.json({ error: "practice" }, { status: 400 });
  const session = await readSession();
  const code = await createChallenge({
    mode,
    seed: run.s,
    area: run.a,
    start: run.bs,
    target: run.b,
    senderUid: session?.uid ?? null,
    label: maskName(session?.name),
  });
  if (!code) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ code, target: run.b });
}
