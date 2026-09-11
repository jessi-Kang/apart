import { NextResponse } from "next/server";
import { kstDateString } from "@/lib/daily";
import { checkAssemble } from "@/lib/assemble";
import { normalizeArea } from "@/lib/areaparam";
import { recordAnswer, answerRate } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** 조립 판정. 본편과 동일하게 서버에서만 정답을 안다. */
export async function POST(req: Request) {
  let body: { date?: string; no?: number; guess?: unknown; area?: unknown; practice?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const today = kstDateString();
  const guessOk =
    Array.isArray(body.guess) && body.guess.length <= 6 && body.guess.every((g) => typeof g === "string" && g.length <= 20);
  if (body.date !== today || !Number.isInteger(body.no) || body.no! < 1 || body.no! > 10 || !guessOk) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const area = normalizeArea(body.area);
  const result = checkAssemble(today, body.no!, body.guess as string[], area);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  // 조립 공식전도 집계한다. 예전에는 감별만 기록해서 조립·찾기는 정답률이 아예 없었다
  if (body.practice !== true) await recordAnswer(today, body.no!, result.correct, area, "assemble");
  const { rate, sample } = await answerRate(today, body.no!, 100, area, "assemble");
  return NextResponse.json({ ...result, rate, sample });
}
