import { NextResponse } from "next/server";
import { kstDateString, quizForDate } from "@/lib/daily";
import { recordAnswer, answerRate } from "@/lib/stats";
import { normalizeArea } from "@/lib/areaparam";

export const dynamic = "force-dynamic";

interface Body {
  date?: string;
  no?: number;
  choice?: "real" | "fake" | "timeout"; // timeout = 시간 초과 (무조건 오답)
  practice?: boolean; // 판정만 하고 집계에 넣지 않는다
  area?: unknown; // 구역별 공식전. 모르는 값은 전국으로 떨어진다
}

/** 서버 판정: 정답 여부 + 공개 정보(실단지 메타 / 가짜 힌트) + 전국 정답률 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const today = kstDateString();
  const { date, no, choice } = body;
  if (date !== today || !Number.isInteger(no) || no! < 1 || no! > 10 || (choice !== "real" && choice !== "fake" && choice !== "timeout")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const area = normalizeArea(body.area);
  const item = quizForDate(today, area)[no! - 1];
  const correct = choice === item.kind;
  if (body.practice !== true) await recordAnswer(today, no!, correct, area, "ox");
  const { rate, sample } = await answerRate(today, no!, 100, area, "ox");

  if (item.kind === "real") {
    const r = item.real!;
    return NextResponse.json({
      correct,
      kind: "real",
      meta: {
        location: `${r.sido} ${r.sigungu} ${r.dong}`,
        builtYear: r.builtYear,
        households: r.households,
      },
      rate,
      sample,
    });
  }
  return NextResponse.json({ correct, kind: "fake", hint: item.fake!.hint, rate, sample });
}
