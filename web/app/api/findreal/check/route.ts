import { NextResponse } from "next/server";
import { kstDateString } from "@/lib/daily";
import { checkFindReal } from "@/lib/findreal";
import { normalizeArea } from "@/lib/areaparam";
import { recordAnswer, answerRate } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** 진짜 찾기 판정. 본편과 동일하게 서버에서만 정답을 안다. */
export async function POST(req: Request) {
  let body: { date?: string; no?: number; pick?: unknown; timeout?: unknown; area?: unknown };
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
  const area = normalizeArea(body.area);
  const result = checkFindReal(today, body.no!, timeout ? null : (body.pick as string), area);
  if (!result) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  // 찾기 공식전도 집계한다 (위 조립과 같은 이유).
  // practice 같은 "집계에 넣지 말라" 스위치는 두지 않는다. 어느 화면도 보낸
  // 적이 없는데 API만 받아 주고 있었고, 그 결과 아무나 흔적 없이 오늘의 정답을
  // 열 번 물어 표를 만들 수 있었다(레드팀 점검에서 실제로 만들어 봤다).
  await recordAnswer(today, body.no!, result.correct, area, "findreal");
  const { rate, sample } = await answerRate(today, body.no!, 100, area, "findreal");
  return NextResponse.json({ ...result, rate, sample });
}
