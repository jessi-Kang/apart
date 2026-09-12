import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { CAPTCHA_COOKIE, verifyCaptcha } from "@/lib/captcha";
import { MAX_BODY, MAX_WHERE, MIN_BODY, saveBug, recentBugs } from "@/lib/bugs";
import { viewerIsOwner } from "@/lib/release";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** 제보 목록 — 운영자만 */
export async function GET() {
  if (!(await viewerIsOwner())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ bugs: await recentBugs() }, { headers: { "Cache-Control": "no-store" } });
}

interface Body {
  body?: unknown;
  where?: unknown;
  answer?: unknown;
  /** 사람 눈에 안 보이는 칸. 채워져 있으면 사람이 아니다 */
  nickname?: unknown;
}

export async function POST(req: Request) {
  let input: Body;
  try {
    input = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 허니팟: 화면에 안 보이는 칸을 채운 쪽은 사람이 아니다.
  // 조용히 성공으로 답한다 — 막혔다는 걸 알려 주면 다음엔 비우고 온다
  if (typeof input.nickname === "string" && input.nickname.length > 0) {
    return NextResponse.json({ ok: true, awarded: false, points: 0 });
  }

  const text = typeof input.body === "string" ? input.body.trim() : "";
  if (text.length < MIN_BODY || text.length > MAX_BODY) {
    return NextResponse.json({ error: "too_short" }, { status: 400 });
  }

  const store = await cookies();
  if (!verifyCaptcha(store.get(CAPTCHA_COOKIE)?.value, input.answer)) {
    return NextResponse.json({ error: "captcha" }, { status: 400 });
  }

  const session = await readSession();
  const result = await saveBug({
    body: text,
    where: typeof input.where === "string" ? input.where.trim().slice(0, MAX_WHERE) : "",
    ua: req.headers.get("user-agent") ?? "",
    uid: session?.uid ?? null,
  });
  if (!result.ok) {
    // 썼는데 안 들어간 것을 들어간 줄 알면 두 번 잃는다. 실패는 그대로 알린다
    return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
  }

  // 캡챠는 한 번 쓰면 버린다 — 같은 답으로 계속 낼 수 없게
  const res = NextResponse.json(result);
  res.cookies.set(CAPTCHA_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
