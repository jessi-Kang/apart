import { NextResponse } from "next/server";
import { authConfigured, readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 현재 로그인 상태. 로그인 기능이 꺼져 있으면 configured=false */
export async function GET() {
  const configured = authConfigured();
  const session = configured ? await readSession() : null;
  return NextResponse.json(
    { configured, user: session ? { name: session.name } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
