import { apartments, isArea } from "./data";
import fakesJson from "@/data/fake_names.json";

/**
 * 작명소 — 사람이 가짜 단지명을 짓는 창구.
 *
 * 감별 창구 셋은 우리가 낸 이름을 사람이 가려내는 곳이고, 여기는 반대다.
 * 사람이 지은 이름을 남이 가려내게 된다. 그래서 "그럴싸함"의 판정을
 * 사람에게 넘기는 창구다.
 *
 * 조각은 우리가 준다. 빈 칸만 주면 무엇을 써야 할지 모르고, 아무 말이나
 * 적으면 아파트 이름으로 읽히지 않는다. 어휘는 지어내지 않고 실단지
 * 12,000여 건에서 실제로 쓰이는 것을 세어 뽑는다 — 그래야 조각만 눌러도
 * 아파트 이름이 나온다.
 *
 * 지역은 반드시 고르게 한다. 아파트 이름의 절반은 동네 이름이고, 그 동네가
 * 어디인지에 따라 같은 이름도 그럴싸함이 갈린다. 고른 지역의 실제 동 이름을
 * 조각으로 준다.
 */

/** 이름에 쓸 수 있는 글자. 한글·영문·숫자·공백만 (특수문자는 아파트 이름에 안 쓴다) */
const ALLOWED = /^[가-힣A-Za-z0-9 ]+$/;
export const MIN_LEN = 4;
export const MAX_LEN = 20;

/** 지역 비하·비속어 계열. 운영하며 늘린다 (validate-pool과 같은 시드) */
const BLACKLIST = ["촌동네", "달동네", "빈민", "서민만"];

/** 관리 단위로 읽히는 이름은 출제에서 빠지므로 애초에 못 짓게 한다 */
const ADMIN_NOISE =
  /관리사무소|\d{3,}\s*동|제\s*\d|\d+\s*구역|임대|\d+\s*호(?!반|텔)|주택도시공사|도시개발공사|SH공사/;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/* ---------- 조각 ---------- */

/** 실단지에서 실제로 쓰이는 꼬리말. 빈도순으로 세어 뽑았다(README·docs/03 참조) */
const BRANDS = [
  "힐스테이트", "푸르지오", "자이", "래미안", "e편한세상", "아이파크", "더샵", "롯데캐슬",
  "위브", "센트레빌", "해링턴플레이스", "데시앙", "블루밍", "스타힐스", "포레나", "어울림",
  "리슈빌", "트루엘", "우미린", "호반써밋", "하늘채", "아너스빌", "예미지", "파밀리에",
];
const OLD_MAKERS = ["현대", "삼성", "대우", "동아", "한신", "경남", "극동", "건영", "진흥", "태영", "주공"];
const PLACE_WORDS = ["센트럴", "파크", "포레", "리버", "레이크", "에듀", "스카이", "하이츠", "시티", "카운티"];
const GRADE_WORDS = ["더", "그랑", "프라임", "퍼스트", "노블", "클래스", "로얄", "팰리스", "뷰", "원"];
const KOREAN_WORDS = ["한마음", "푸른숲", "해오름", "늘푸른", "무지개", "한아름", "청솔", "백합", "목련", "마을", "타운", "맨션"];

export interface PieceGroup {
  key: string;
  label: string;
  hint: string;
  items: string[];
}

/** 그 지역에서 실제로 쓰는 동·시군구 이름 (조각의 첫 칸) */
function placeNames(area: string): string[] {
  const seen = new Set<string>();
  for (const a of apartments) {
    if (a.sido !== area) continue;
    const dong = a.dong.replace(/\d+가$/, "").replace(/\d/g, "");
    const bare = dong.replace(/[동로]$/, "");
    if (bare.length >= 2) seen.add(bare);
    const gu = a.sigungu.replace(/[시군구]$/, "");
    if (gu.length >= 2) seen.add(gu);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "ko"));
}

/** 이 지역에서 이름을 지을 때 쓸 조각들 */
export function piecesFor(area: string): PieceGroup[] | null {
  if (!isArea(area)) return null;
  return [
    { key: "place", label: "동네", hint: "이 구역에 실제로 있는 동네 이름", items: placeNames(area) },
    { key: "brand", label: "브랜드", hint: "실존 브랜드", items: BRANDS },
    { key: "maker", label: "옛 건설사", hint: "구축 이름에 붙는 말", items: OLD_MAKERS },
    { key: "place2", label: "입지", hint: "무엇이 가깝다고 말하는 말", items: PLACE_WORDS },
    { key: "grade", label: "격", hint: "얼마나 좋은지 말하는 말", items: GRADE_WORDS },
    { key: "korean", label: "한글", hint: "옛 단지에 흔한 우리말", items: KOREAN_WORDS },
  ];
}

/* ---------- 판정 ---------- */

/** 지역 이름 그 자체 (시·도·시군구·동과 그 줄임말). 이것만으로는 단지명이 아니다 */
const placeOnly = (() => {
  const set = new Set<string>();
  for (const a of apartments) {
    for (const t of [a.sido, a.sigungu, a.dong]) if (t) set.add(norm(t));
    set.add(norm(a.sigungu.replace(/[시군구]$/, "")));
    set.add(norm(a.dong.replace(/\d+가$/, "").replace(/\d/g, "").replace(/[동로]$/, "")));
  }
  set.delete("");
  return set;
})();

export type NameVerdict =
  | { ok: true }
  /** 이미 있는 이름이거나 사실상 같은 이름 */
  | { ok: false; reason: "exists"; near: string }
  | { ok: false; reason: "format"; message: string };

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

const tokenOverlap = (a: string, b: string) => {
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  return [...ta].filter((t) => tb.has(t)).length / Math.max(ta.size, tb.size);
};

/**
 * 지은 이름을 실단지·기존 가짜와 대조한다.
 *
 * 판정은 서버에서만 한다. 실단지 목록을 클라이언트에 내려주면 그걸로
 * 감별 창구의 답을 맞출 수 있다 — 작명소가 정답지를 흘리는 문이 된다.
 *
 * 임계값은 validate-pool과 같다. 여기서 통과시킨 이름이 출제 풀 검증에서
 * 떨어지면 승인할 수 없는 이름을 접수해 둔 꼴이 된다.
 */
export function judgeName(raw: string): NameVerdict {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < MIN_LEN || name.length > MAX_LEN)
    return { ok: false, reason: "format", message: `${MIN_LEN}자에서 ${MAX_LEN}자 사이로 지어 주세요` };
  if (!ALLOWED.test(name))
    return { ok: false, reason: "format", message: "한글·영문·숫자와 띄어쓰기만 쓸 수 있습니다" };
  if (ADMIN_NOISE.test(name))
    return { ok: false, reason: "format", message: "동·호수나 관리 단위가 들어간 이름은 출제할 수 없습니다" };
  for (const w of BLACKLIST)
    if (name.includes(w)) return { ok: false, reason: "format", message: "쓸 수 없는 말이 들어 있습니다" };

  const nf = norm(name);
  // 지역 이름 하나만 적는 것은 단지명이 아니다("부산광역시", "해운대").
  // 조각을 한 번만 누르고 접수하면 이렇게 되므로 여기서 막는다
  if (placeOnly.has(nf)) return { ok: false, reason: "format", message: "동네 이름만으로는 단지명이 되지 않습니다" };
  for (const f of fakesJson.items as { name: string }[]) {
    if (norm(f.name) === nf) return { ok: false, reason: "exists", near: f.name };
  }
  for (const r of apartments) {
    const nr = norm(r.name);
    if (nf === nr) return { ok: false, reason: "exists", near: r.name };
    const limit = Math.min(nf.length, nr.length) <= 5 ? 1 : Math.min(nf.length, nr.length) <= 11 ? 2 : 3;
    if (editDistance(nf, nr) <= limit) return { ok: false, reason: "exists", near: r.name };
    if (tokenOverlap(name, r.name) >= 0.8) return { ok: false, reason: "exists", near: r.name };
  }
  return { ok: true };
}
