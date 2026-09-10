import { NextResponse } from "next/server";
import { kstDateString } from "@/lib/daily";
import { checkFindReal } from "@/lib/findreal";

export const dynamic = "force-dynamic";

/** 진짜 찾기 판정. 본편과 동일하게 서버에서만 정답을 안다. */
export async function POST(req: Request) {
  let body: { date?: string; no?: number; pick?: unknown; timeout?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const today = kstDateString();
  const timeout = body.timeout === true; // 시간 초과: 선택 없이 오답 처리
  const pickOk = timeout || (typeof body.pick === "string" && body.pick.length <= 30);
  if (body.date !== today || !Number.isInteger(body.no) || body.no! < 1 || body.no! > 10 || !pickOk) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = checkFindReal(today, body.no!, timeout ? null : (body.pick as string));
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  return NextResponse.json(result);
}
