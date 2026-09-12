import { NextResponse } from "next/server";
import { authConfigured, readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 현재 로그인 상태. 로그인 기능이 꺼져 있으면 configured=false */
export async function GET() {
  const configured = authConfigured();
  const session = configured ? await readSession() : null;
  return NextResponse.json(
    // owner: 전개 전 창구를 볼 수 있는 계정인가. OWNER_EMAIL이 제대로 들어갔는지
    // 본인이 바로 확인할 수 있게 자기 상태만 돌려준다
    { configured, user: session ? { name: session.name, owner: Boolean(session.own) } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
