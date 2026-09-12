import { notFound } from "next/navigation";
import { canSee, gameByKey, viewerIsOwner } from "./release";

/**
 * 전개 전 창구를 주소로 들어오는 것까지 막는다.
 * 홈에서 안 보이게만 하면 주소를 아는 사람은 그냥 들어온다.
 *
 * 못 보는 사람에게는 "없는 페이지"로 답한다. "권한이 없습니다"라고 하면
 * 아직 안 연 창구가 있다는 사실 자체를 알려 주는 셈이다.
 */
export async function requireReleased(key: string): Promise<void> {
  const owner = await viewerIsOwner();
  if (!canSee(gameByKey(key), owner)) notFound();
}

/** API 라우트용. 막아야 하면 404 응답을 돌려주고, 아니면 null */
export async function blockIfUnreleased(key: string): Promise<Response | null> {
  const owner = await viewerIsOwner();
  if (canSee(gameByKey(key), owner)) return null;
  return Response.json({ error: "not_found" }, { status: 404 });
}
