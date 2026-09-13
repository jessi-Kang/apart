import { NextResponse } from "next/server";
import { kstDateString, quizForDate } from "@/lib/daily";
import { recordAnswer, answerRate } from "@/lib/stats";
import { recordName } from "@/lib/namestats";
import { normalizeArea } from "@/lib/areaparam";
import { readSession } from "@/lib/auth";
import { claimOfficialAnswer } from "@/lib/officialrun";

export const dynamic = "force-dynamic";

interface Body {
  date?: string;
  no?: number;
  choice?: "real" | "fake" | "timeout"; // timeout = 시간 초과 (무조건 오답)
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
  // practice 같은 "집계에 넣지 말라" 스위치는 두지 않는다. 어느 화면도 보낸
  // 적이 없는데 API만 받아 주고 있었고, 그 결과 아무나 흔적 없이 오늘의 정답을
  // 열 번 물어 표를 만들 수 있었다(레드팀 점검에서 실제로 만들어 봤다).
  //
  // 첫 답이 최종 답이다. 두 번째부터는 첫 답의 판정을 그대로 돌려주고 집계에
  // 넣지 않는다 — 알고 나서 답을 바꿔도 소용이 없어야 공식전 순위가 뜻을 갖는다
  const session = await readSession();
  const claim = await claimOfficialAnswer({
    uid: session?.uid ?? null,
    date: today,
    area,
    mode: "ox",
    no: no!,
    correct,
  });
  if (claim.first) {
    await recordAnswer(today, no!, correct, area, "ox");
    // 이름별 집계: 어떤 이름에 사람들이 잘 속는지. 시간 초과는 판단이 아니라
    // 판단하지 못한 것이므로 속았다고 세지 않는다
    const shownName = item.kind === "real" ? item.real!.name : item.fake!.name;
    if (choice !== "timeout") await recordName(shownName, item.kind, !correct);
  }
  const { rate, sample } = await answerRate(today, no!, 100, area, "ox");

  if (item.kind === "real") {
    const r = item.real!;
    return NextResponse.json({
      // 첫 답의 판정이다. 두 번째부터 답을 바꿔도 이 값은 안 바뀐다
      correct: claim.correct,
      replay: !claim.first,
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
  return NextResponse.json({
    correct: claim.correct,
    replay: !claim.first,
    kind: "fake",
    hint: item.fake!.hint,
    rate,
    sample,
  });
}
