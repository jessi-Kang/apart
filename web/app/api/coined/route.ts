import { NextResponse } from "next/server";
import { viewerIsOwner } from "@/lib/release";
import { recentCoined, setCoinedStatus, type CoinStatus } from "@/lib/coined";

export const dynamic = "force-dynamic";

const PAGE = 20;
const num = (v: string | null, fallback: number, max: number) => {
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback;
};

/** 접수된 작명 목록 — 운영자만. 승인 전이라 아직 출제되지 않은 이름들이다 */
export async function GET(req: Request) {
  if (!(await viewerIsOwner())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const offset = num(q.get("offset"), 0, 100_000);
  const onlyPending = q.get("scope") !== "all";
  const { rows, total, pending } = await recentCoined(PAGE, offset, onlyPending);
  return NextResponse.json(
    { coined: rows, total, pending, offset, limit: PAGE, onlyPending },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const STATUSES: CoinStatus[] = ["pending", "approved", "rejected"];

/**
 * 승인·반려 표시 — 운영자만.
 *
 * 승인은 "출제해도 되는 이름"이라는 표시일 뿐 그 자체로 출제되지는 않는다.
 * 실제 출제는 `npm run export-coined`로 정적 풀에 내보낸 뒤다. 공식전이
 * (날짜, 구역) 시드로 결정론이어야 해서 런타임에 DB를 섞을 수 없다.
 *
 * 운영자가 아니면 404다. "권한 없음"이라고 답하면 그런 문이 있다는 사실
 * 자체를 알려 주는 셈이다 (lib/release.ts와 같은 원칙).
 */
export async function PATCH(req: Request) {
  if (!(await viewerIsOwner())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { id?: unknown; status?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 숫자로도 문자열로도 올 수 있다. bigint를 문자열로 돌려주는 드라이버가
  // 섞여 있어서, 바깥에서 들어오는 값은 한 번 숫자로 맞춰 놓고 검사한다
  const raw = Number(body.id);
  const id = Number.isInteger(raw) && raw > 0 ? raw : null;
  const status = STATUSES.find((s) => s === body.status);
  if (id === null || !status) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  // 저장이 안 됐는데 됐다고 답하면 다시 훑을 때 같은 이름이 또 나온다
  const done = await setCoinedStatus(id, status);
  if (!done) return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, id, status });
}
