import { readSession } from "./auth";

/**
 * 창구 전개 관리.
 *
 * 새로 만든 창구를 곧바로 전원에게 열면 되돌릴 수가 없다. 그래서 창구마다
 * "전개했는가" 한 칸을 두고, 전개 전에는 운영자 계정에만 보인다.
 * 전개하기로 정한 날 released를 true로 바꾸는 것이 전부다.
 *
 * 숨기는 것과 막는 것은 다르다. 홈에서 안 보이게만 하면 주소를 아는 사람은
 * 그냥 들어온다. 그래서 화면과 API 양쪽에서 같은 함수로 막는다.
 *
 * 운영자는 OWNER_EMAIL 환경변수로 정한다(로컬 .env.local + Vercel,
 * 절대 커밋하지 않는다). 값이 비어 있으면 아무도 운영자가 아니다 —
 * 깜빡했을 때 전원에게 열리는 쪽으로 기울면 안 된다.
 */

export interface GameDef {
  key: string;
  label: string;
  href: string;
  desc: string;
  /** 전원에게 열렸는가. false면 운영자에게만 보인다 */
  released: boolean;
}

export const GAMES: GameDef[] = [
  { key: "ox", label: "감별 O/X", href: "/play", desc: "이름 하나를 보고 진짜/가짜", released: true },
  { key: "assemble", label: "이름 조립", href: "/assemble", desc: "힌트로 단지명 조립", released: true },
  { key: "findreal", label: "진짜 찾기", href: "/findreal", desc: "넷 중 진짜는 하나", released: true },
];

export const gameByKey = (key: string): GameDef | undefined => GAMES.find((g) => g.key === key);

/** 지금 보는 사람이 운영자인가 */
export async function viewerIsOwner(): Promise<boolean> {
  const session = await readSession();
  return Boolean(session?.own);
}

/** 이 사람에게 보여도 되는 창구인가 */
export function canSee(game: GameDef | undefined, owner: boolean): boolean {
  if (!game) return false;
  return game.released || owner;
}

/** 이 사람에게 보여도 되는 창구 목록 */
export async function visibleGames(): Promise<GameDef[]> {
  const owner = await viewerIsOwner();
  return GAMES.filter((g) => canSee(g, owner));
}
