import { NextResponse } from "next/server";
import { kstDateString } from "@/lib/daily";
import { checkAssemble } from "@/lib/assemble";

export const dynamic = "force-dynamic";

/** 조립 판정. 본편과 동일하게 서버에서만 정답을 안다. */
export async function POST(req: Request) {
  let body: { date?: string; no?: number; guess?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const today = kstDateString();
  const guessOk =
    Array.isArray(body.guess) && body.guess.length <= 6 && body.guess.every((g) => typeof g === "string" && g.length <= 20);
  if (body.date !== today || !Number.isInteger(body.no) || body.no! < 1 || body.no! > 3 || !guessOk) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = checkAssemble(today, body.no!, body.guess as string[]);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  return NextResponse.json(result);
}
