import { apartments, fakeNames, type Apartment } from "./data";
import { choseongHint } from "./hangul";
import { geoOf } from "./geo";

/**
 * 무한 모드 출제 (데일리와 별개, 매 요청 랜덤)
 * - 데일리 회차는 전원 동일 문제(비교·공유의 축)로 남기고,
 *   무한 모드는 "계속 도전"용으로 풀 전체에서 랜덤 출제한다
 * - 정답은 여기(서버)에서만 판정한다. 문제 식별은 이름/단지 id로만 하고
 *   진짜/가짜 여부를 유추할 수 있는 값은 클라이언트에 내려주지 않는다
 * - 전국 집계에는 넣지 않는다 (문제가 제각각이라 정답률 비교가 무의미)
 */

const normName = (s: string) => s.replace(/\s+/g, "").toLowerCase();

const realByName = new Map(apartments.map((a) => [normName(a.name), a]));
const fakeByName = new Map(fakeNames.map((f) => [normName(f.name), f]));

function metaOf(a: Apartment) {
  return {
    location: `${a.sido} ${a.sigungu} ${a.dong}`,
    builtYear: a.builtYear,
    households: a.households,
  };
}

/** 정답 공개용: 좌표까지. 문제를 낼 때(조립 힌트 등)는 metaOf만 쓴다 */
function revealOf(a: Apartment) {
  const geo = geoOf(a.id);
  return { ...metaOf(a), ...(geo && { geo }) };
}

/* ---------- 감별 O/X ---------- */

// 무한 판의 출제는 lib/run.ts가 한다 (판마다 시드를 두어 도전장으로 되살린다)

export function judgeOx(
  name: string,
  choice: "real" | "fake" | "timeout", // timeout = 시간 초과 (무조건 오답)
):
  | { correct: boolean; kind: "real"; meta: ReturnType<typeof revealOf> }
  | { correct: boolean; kind: "fake"; hint: string }
  | null {
  const key = normName(name);
  const real = realByName.get(key);
  if (real) return { correct: choice === "real", kind: "real", meta: revealOf(real) };
  const fake = fakeByName.get(key);
  if (fake) return { correct: choice === "fake", kind: "fake", hint: fake.hint };
  return null;
}

/* ---------- 진짜 찾기 ---------- */


export function judgeFind(
  options: unknown,
  pickName: unknown, // null = 시간 초과 (오답 처리, 정답은 공개)
): { correct: boolean; answer: string; meta: ReturnType<typeof revealOf> } | null {
  if (
    !Array.isArray(options) ||
    options.length !== 4 ||
    !options.every((o) => typeof o === "string" && o.length <= 30) ||
    (pickName !== null && (typeof pickName !== "string" || !options.includes(pickName)))
  )
    return null;
  const reals = options.map((o) => realByName.get(normName(o))).filter((a): a is Apartment => Boolean(a));
  const allKnown = options.every((o) => realByName.has(normName(o)) || fakeByName.has(normName(o)));
  if (reals.length !== 1 || !allKnown) return null; // 조작된 보기 거부
  const real = reals[0];
  return {
    correct: pickName !== null && normName(pickName as string) === normName(real.name),
    answer: real.name,
    meta: revealOf(real),
  };
}

/* ---------- 이름 조립 ---------- */


const realById = new Map(apartments.map((a) => [a.id, a]));

/** 무한 조립의 초성 힌트 (데일리와 같은 규칙) */
export function assembleHintById(id: unknown, tier: number, filled: number[] = []): { mask: string } | null {
  if (typeof id !== "string" || !Number.isInteger(tier) || tier < 1) return null;
  const apt = realById.get(id);
  if (!apt) return null;
  return { mask: choseongHint(apt.name, Math.min(tier, 3), id, filled) };
}

export function judgeAssemble(
  id: unknown,
  guess: unknown,
): { correct: boolean; answer: string; meta: ReturnType<typeof revealOf> } | null {
  if (typeof id !== "string") return null;
  const apt = realById.get(id);
  if (!apt) return null;
  const guessOk = Array.isArray(guess) && guess.length <= 6 && guess.every((g) => typeof g === "string" && g.length <= 20);
  if (!guessOk) return null;
  return { correct: (guess as string[]).join(" ") === apt.name, answer: apt.name, meta: revealOf(apt) };
}
