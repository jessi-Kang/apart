import apartmentsJson from "@/data/apartments.json";
import fakesJson from "@/data/fake_names.json";

export type Difficulty = "easy" | "mid" | "hard";

export interface Apartment {
  id: string;
  name: string;
  sido: string;
  sigungu: string;
  dong: string;
  builtYear: number;
  households: number;
  difficulty: Difficulty;
}

export interface FakeName {
  id: string;
  name: string;
  hint: string;
  difficulty: Difficulty;
}

/**
 * K-apt 원본에는 단지명이 아니라 관리 단위가 이름 칸에 들어온 행이 섞여 있다.
 * "대림아파트201동", "OO제2관리사무소", "OO임대", "텐즈힐2구역" 같은 것들.
 * 문제로 내면 "이게 아파트 이름이야?" 소리가 나오는 게 당연하고,
 * 임대/제N은 같은 단지가 두 번 나오는 중복이기도 해서 출제 풀에서 뺀다.
 */
const ADMIN_NOISE =
  /관리사무소|\d{3,}|제\s*\d|\d+\s*구역|임대|\d+\s*호(?!반|텔)|주택도시공사|도시개발공사|SH공사/;

export const apartments: Apartment[] = (apartmentsJson.items as Apartment[]).filter(
  (a) => !ADMIN_NOISE.test(a.name),
);
export const fakeNames: FakeName[] = (fakesJson.items as FakeName[]).filter(
  (f) => !ADMIN_NOISE.test(f.name),
);

/* ---------- 구역 출제 ---------- */

const MIN_POOL = 20; // 표본이 얇으면 같은 문제가 곧바로 되풀이된다

/**
 * 고를 수 있는 구역 = 시·도.
 * 자치구까지 쪼갤 수 있는 건 전수 수집이 끝난 서울뿐이라, 서울만 구를 열면
 * "왜 여기는 구가 있고 저기는 없지"가 생기고 게임마다 적용 범위도 갈렸다
 * (조립은 구 단위로는 퍼즐이 3~20개뿐이라 시·도로 넓혀야 했다).
 * 시·도 하나로 맞추면 세 창구가 같은 범위를 쓰고 설명할 것도 없어진다.
 */
export interface RegionGroup {
  sido: string;
  label: string;
}

const bySido = new Map<string, Apartment[]>();
for (const a of apartments) {
  const list = bySido.get(a.sido);
  if (list) list.push(a);
  else bySido.set(a.sido, [a]);
}

const shortSido = (s: string) => s.replace(/특별자치시$|특별시$|광역시$/, "");

export const regions: RegionGroup[] = [...bySido.entries()]
  .filter(([, list]) => list.length >= MIN_POOL)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([sido]) => ({ sido, label: shortSido(sido) }));

const sidoSet = new Set(regions.map((r) => r.sido));

/** 고른 값이 쓸 수 있는 구역인가 */
export const isArea = (x: unknown): x is string => typeof x === "string" && sidoSet.has(x);

/**
 * 가짜 이름이 어느 구역의 말투인지 — "송파현대"처럼 지역/동 이름을 단 가짜는
 * 그 구역에서만 쓴다. 구역을 고르고 놀 때 진짜만 그 동네 이름이면
 * "낯선 동네 이름 = 가짜"라는 공짜 힌트가 생기기 때문이다.
 *
 * 지역 이름 목록은 K-apt 단지의 동 이름에서 뽑는다. 그래서 아파트가 한 곳도
 * 없는 동네(체부동·누상동 등)의 이름은 여기 안 잡히고 지역색 없는 이름으로 남는다.
 * 남는 구멍이지만 틀린 답을 만들지는 않고(가짜는 그대로 가짜다), 메우려면
 * 법정동 전체 표가 필요해서 지금은 여기까지 한다.
 */
/** 구 이름은 도시마다 겹친다(서울 중구·부산 중구). 시·도까지 붙여야 구분된다 */
const guKey = (sido: string, sigungu: string) => `${sido}|${sigungu}`;

const regionTokens = (() => {
  const m = new Map<string, Set<string>>();
  const add = (token: string, key: string) => {
    if (token.length < 2) return;
    let set = m.get(token);
    if (!set) m.set(token, (set = new Set()));
    set.add(key);
  };
  // 걸러내기 전 원본에서 뽑는다. 관리 단위 행만 있던 동네(삼양동 등)도
  // 지역 이름으로는 살아 있어야 가짜가 그 동네 이름을 달고 새어 나가지 않는다.
  for (const a of apartmentsJson.items as Apartment[]) {
    const key = guKey(a.sido, a.sigungu);
    // 문래동3가 → 문래동 → 문래, 원효로1가 → 원효로. "N가"를 안 떼면
    // "문래" 같은 흔한 지역 이름이 토큰에서 통째로 빠진다
    const dong = a.dong.replace(/\d+가$/, "").replace(/\d/g, "");
    const bare = dong.replace(/[동로]$/, "");
    add(dong, key);
    add(bare, key);
    // 하월곡·상계처럼 방위 글자가 붙은 법정동은 사람들이 "월곡"으로 부른다.
    // 가짜 이름도 그 줄임말을 쓰기 때문에 줄임말까지 지역 이름으로 친다.
    add(bare.replace(/^[상하신구동서남북중]/, ""), key);
    add(a.sigungu, key);
    add(a.sigungu.replace(/구$/, ""), key);
  }
  return m;
})();

/** 그 가짜 이름이 어느 구역에서 쓰여도 되는지. null = 다른 동네 이름을 달고 있다 */
const fakeAreas = new Map<string, Set<string> | null>();
for (const f of fakeNames) {
  const flat = f.name.replace(/\s+/g, "");
  // 이름 안에 든 지역 이름들이 공통으로 가리키는 구역만 남긴다.
  // 아무 지역 이름도 없으면 어느 구역에서 내도 되는 이름(null)이다.
  const found: string[][] = [];
  for (const [token, gus] of regionTokens) {
    if (flat.includes(token)) found.push([...gus]);
  }
  if (found.length === 0) {
    fakeAreas.set(f.id, null);
    continue;
  }
  const allowed = found.reduce((acc, gus) => acc.filter((g) => gus.includes(g)));
  fakeAreas.set(f.id, new Set(allowed));
}

/** 그 구역에서 낼 수 있는 진짜/가짜. area가 없거나 모르는 값이면 전국 */
export function poolOf(area?: string | null): { reals: Apartment[]; fakes: FakeName[] } {
  if (!area || !isArea(area)) return { reals: apartments, fakes: fakeNames };
  const reals = apartments.filter((a) => a.sido === area);
  const allow = new Set(reals.map((a) => guKey(a.sido, a.sigungu)));
  return {
    reals,
    fakes: fakeNames.filter((f) => {
      const gus = fakeAreas.get(f.id);
      if (gus === null) return true; // 지역색 없는 이름은 어디서나
      if (!gus) return false;
      for (const g of gus) if (allow.has(g)) return true;
      return false;
    }),
  };
}

/** 화면에 쓰는 구역 이름 (서울특별시 → 서울) */
export const areaLabel = (area: string) => (isArea(area) ? shortSido(area) : area);

/* ---------- 이름 조립의 구역 ---------- */

const MIN_ASSEMBLE = 20; // 이보다 얇으면 같은 퍼즐이 바로 되풀이된다

/**
 * 조립 퍼즐은 이름에 공백이 있어야 조각으로 쪼개진다. 그런 단지가 전국에 677곳뿐이라
 * 다른 창구보다 풀이 훨씬 얇다. 시·도 단위로는 세종 31곳 ~ 서울 259곳이라 쓸 만하고,
 * 그보다 얇은 시·도가 생기면 전국으로 되돌린다.
 */
export function assemblePoolOf(area?: string | null): {
  reals: Apartment[];
  fakes: FakeName[];
  sido: string | null;
} {
  const all = apartments.filter((a) => a.name.split(" ").length >= 2);
  if (!area || !isArea(area)) return { reals: all, fakes: fakeNames, sido: null };
  const reals = all.filter((a) => a.sido === area);
  if (reals.length < MIN_ASSEMBLE) return { reals: all, fakes: fakeNames, sido: null };
  // 함정 조각도 같은 범위의 가짜에서 뽑는다 — 딴 동네 단어만 함정이면 그게 곧 힌트다
  return { reals, fakes: poolOf(area).fakes, sido: area };
}
