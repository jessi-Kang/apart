import { NextResponse } from "next/server";
import { authConfigured, ownerConfigured, readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 현재 로그인 상태. 로그인 기능이 꺼져 있으면 configured=false */
export async function GET() {
  const configured = authConfigured();
  const session = configured ? await readSession() : null;
  return NextResponse.json(
    // owner: 전개 전 창구를 볼 수 있는 계정인가. OWNER_EMAIL이 제대로 들어갔는지
    // 본인이 바로 확인할 수 있게 자기 상태만 돌려준다
    {
      configured,
      // 운영자 이메일이 이 배포에 들어와 있는가. 값은 내보내지 않고 있고 없고만.
      // 이게 있어야 "환경변수가 안 들어갔다"와 "이메일이 다르다"를 구분할 수 있다
      ownerConfigured: ownerConfigured(),
      user: session ? { name: session.name, owner: Boolean(session.own) } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
