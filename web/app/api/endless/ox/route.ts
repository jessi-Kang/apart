import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { creditCorrect } from "@/lib/xpbudget";
import { blockIfUnreleased } from "@/lib/guard";
import { randomOx, judgeOx } from "@/lib/endless";
import { recordName } from "@/lib/namestats";

export const dynamic = "force-dynamic";

/** 무한 감별: GET = 랜덤 문제(?area=자치구면 그 구역만), POST = 판정 (집계 미반영) */
export function GET(req: Request) {
  const url = new URL(req.url);
  const area = url.searchParams.get("area");
  // 최근 문제의 정체. r/f 여덟 자까지만 받는다 — 그 밖의 값은 없는 것으로 친다
  const raw = url.searchParams.get("recent") ?? "";
  const recent = /^[rf]{0,8}$/.test(raw) ? raw : "";
  return NextResponse.json(randomOx(area, recent));
}

export async function POST(req: Request) {
  // 전개 전 창구는 API로도 안 열린다 (lib/release.ts)
  const blocked = await blockIfUnreleased("ox");
  if (blocked) return blocked;
  let body: { name?: unknown; choice?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const nameOk = typeof body.name === "string" && body.name.length <= 30;
  const choiceOk = body.choice === "real" || body.choice === "fake" || body.choice === "timeout";
  if (!nameOk || !choiceOk) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const choice = body.choice as "real" | "fake" | "timeout";
  const result = judgeOx(body.name as string, choice);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  // 이름별 집계는 무한에서 가장 많이 쌓인다 — 무한이 본편이라 표본의 대부분이 여기다.
  // 시간 초과는 판단이 아니라 판단하지 못한 것이므로 속았다고 세지 않는다
  if (choice !== "timeout") await recordName(body.name as string, result.kind, !result.correct);
  // 맞혔으면 경험치 한도를 올린다 (lib/xpbudget.ts)
  if (result.correct) await creditCorrect((await readSession())?.uid, "ox");
  return NextResponse.json(result);
}
