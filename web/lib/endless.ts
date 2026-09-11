import { apartments, fakeNames, type Apartment } from "./data";
import { choseongMask } from "./hangul";

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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function metaOf(a: Apartment) {
  return {
    location: `${a.sido} ${a.sigungu} ${a.dong}`,
    builtYear: a.builtYear,
    households: a.households,
  };
}

/* ---------- 감별 O/X ---------- */

export function randomOx(): { name: string } {
  const real = Math.random() < 0.5;
  return { name: real ? pick(apartments).name : pick(fakeNames).name };
}

export function judgeOx(
  name: string,
  choice: "real" | "fake" | "timeout", // timeout = 시간 초과 (무조건 오답)
):
  | { correct: boolean; kind: "real"; meta: ReturnType<typeof metaOf> }
  | { correct: boolean; kind: "fake"; hint: string }
  | null {
  const key = normName(name);
  const real = realByName.get(key);
  if (real) return { correct: choice === "real", kind: "real", meta: metaOf(real) };
  const fake = fakeByName.get(key);
  if (fake) return { correct: choice === "fake", kind: "fake", hint: fake.hint };
  return null;
}

/* ---------- 진짜 찾기 ---------- */

export function randomFind(): { options: string[] } {
  const real = pick(apartments);
  const fakes = new Set<string>();
  while (fakes.size < 3) fakes.add(pick(fakeNames).name);
  const options = [real.name, ...fakes];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { options };
}

export function judgeFind(
  options: unknown,
  pickName: unknown, // null = 시간 초과 (오답 처리, 정답은 공개)
): { correct: boolean; answer: string; meta: ReturnType<typeof metaOf> } | null {
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
    meta: metaOf(real),
  };
}

/* ---------- 이름 조립 ---------- */

const multiToken = apartments.filter((a) => a.name.split(" ").length >= 2);
const DECOY_POOL = [...new Set(fakeNames.flatMap((f) => f.name.split(" ")))];

export function randomAssemble(): {
  id: string;
  pieces: string[];
  answerLen: number;
  hint: { location: string; builtYear: number; households: number };
} {
  const apt = pick(multiToken);
  const answer = apt.name.split(" ");
  const decoys: string[] = [];
  const cand = DECOY_POOL.filter((t) => !answer.includes(t));
  while (decoys.length < (answer.length >= 3 ? 2 : 3) && cand.length) {
    const t = cand.splice(Math.floor(Math.random() * cand.length), 1)[0];
    decoys.push(t);
  }
  const pieces = [...answer, ...decoys];
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return { id: apt.id, pieces, answerLen: answer.length, hint: metaOf(apt) };
}

const realById = new Map(apartments.map((a) => [a.id, a]));

/** 무한 조립의 초성 힌트 (데일리와 같은 규칙) */
export function assembleHintById(id: unknown, tier: number): { mask: string } | null {
  if (typeof id !== "string" || !Number.isInteger(tier) || tier < 1) return null;
  const apt = realById.get(id);
  if (!apt) return null;
  return { mask: choseongMask(apt.name, Math.min(tier, 3)) };
}

export function judgeAssemble(
  id: unknown,
  guess: unknown,
): { correct: boolean; answer: string; meta: ReturnType<typeof metaOf> } | null {
  if (typeof id !== "string") return null;
  const apt = realById.get(id);
  if (!apt) return null;
  const guessOk = Array.isArray(guess) && guess.length <= 6 && guess.every((g) => typeof g === "string" && g.length <= 20);
  if (!guessOk) return null;
  return { correct: (guess as string[]).join(" ") === apt.name, answer: apt.name, meta: metaOf(apt) };
}
