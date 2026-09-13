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
  /**
   * 공식전이 있는 창구인가.
   *
   * 대장의 현황 칸이 이걸 보고 갈린다. 감별 셋은 같은 10문제로 겨룰 수 있어
   * 공식전이 성립하지만, 작명소는 답이 없는 창구라 점수로 줄 세울 것이 없다.
   * 없는 창구에까지 "출전하기"를 걸어 두면 눌러도 갈 데가 없다.
   */
  official: boolean;
}

export const GAMES: GameDef[] = [
  { key: "ox", label: "감별 O/X", href: "/o", desc: "이름 하나를 보고 진짜/가짜", released: true, official: true },
  { key: "assemble", label: "이름 조립", href: "/a", desc: "힌트로 단지명 조립", released: true, official: true },
  { key: "findreal", label: "진짜 찾기", href: "/f", desc: "넷 중 진짜는 하나", released: true, official: true },
  // 아직 전개 전이다. 운영자에게만 보이고, 확인이 끝나면 released를 true로 바꾼다
  { key: "naming", label: "작명소", href: "/n", desc: "가짜 단지명 직접 짓기", released: false, official: false },
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

/**
 * 이 사람에게는 아직 안 열린 창구 목록.
 *
 * 홈 대장에 "미개설" 줄로만 비춘다. 창구가 더 생길 예정이라는 것 자체는
 * 숨길 이유가 없고, 그 줄이 있어야 대장이 끝난 것처럼 보이지 않는다.
 * 손으로 박아 두면 전개하는 날 두 줄(진짜 줄 + 미개설 줄)이 함께 뜬다 —
 * 실제로 작명소를 등록하자마자 운영자 화면에 두 번 나왔다.
 */
export async function hiddenGames(): Promise<GameDef[]> {
  const owner = await viewerIsOwner();
  return GAMES.filter((g) => !canSee(g, owner));
}
