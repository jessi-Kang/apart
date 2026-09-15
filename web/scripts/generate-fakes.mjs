#!/usr/bin/env node
/**
 * 가짜 단지명 생성.
 *
 * 왜 필요한가. 실단지는 매일 밤 늘고, 늘어날 때마다 "사실상 실존"이 된 가짜가
 * 빠진다(promote-apartments.mjs). 가만두면 가짜 풀은 줄기만 한다. 실단지
 * 15,837건에 가짜 504건이면 같은 가짜가 금방 되돌아온다.
 *
 * 왜 틀을 손으로 정하지 않는가. 손으로 정한 틀은 반드시 티가 난다. 실제로
 * 기존 523건은 띄어쓴 이름이 49.6%인데 실단지는 15.9%였다 — 이름을 읽지
 * 않고 **공백만 세도 76% 맞힐 수 있었다.** 길이가 정답 힌트가 되면 안 된다는
 * 것과 같은 문제인데 이쪽이 더 셌다.
 *
 * 그래서 실단지를 토막 내 틀과 그 빈도를 **배운다**. 어떤 배열이 얼마나
 * 흔한지, 그 배열이 띄어 쓰이는 비율은 얼마인지, 글자 수는 어떻게 퍼져
 * 있는지. 뽑을 때 그 분포대로 뽑으면 모양만 보고는 가릴 수 없다.
 *
 *   1) 실단지를 어휘 사전으로 토막 낸다        → 틀과 빈도
 *   2) 그 빈도대로 틀을 고르고 칸을 채운다      → 후보
 *   3) 실단지 글자 수 분포에서 벗어나면 버린다  → 모양 맞추기
 *   4) 실단지·기존 가짜와 너무 가까우면 버린다  → 정답 시비 방지
 *   5) 말 거르기에 걸리면 버린다                → 욕설·비하
 *
 * 어휘는 data/name_pieces.json 한 곳에 있고 작명소(lib/naming.ts)와 같이 쓴다.
 * 지역어는 어휘에 적지 않는다 — 실단지의 동 이름을 그대로 쓴다. 지어낸 동네
 * 이름은 그 지역 사람이 바로 알아본다.
 *
 * 옵션
 *   --max=N      한 번에 넣을 최대 건수 (기본 60)
 *   --target=N   가짜 풀이 이 크기가 되면 더 넣지 않는다 (기본 2000)
 *   --seed=N     같은 씨앗이면 같은 결과. 시험용
 *   --dry        파일을 건드리지 않고 결과만 보여준다
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(WEB, "data", f), "utf8"));

const flag = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const MAX = flag("max", 60);
const TARGET = flag("target", 2000);
const DRY = has("dry");

/* ---------- 씨앗 있는 난수 (같은 씨앗 = 같은 결과, 시험할 수 있게) ---------- */
let seed = flag("seed", Date.now() % 2147483647) || 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
/** 가중치대로 하나 고른다. [[값, 무게], ...] */
function weighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}

/* ---------- 겹침 판정 (validate-pool.mjs와 같아야 한다) ---------- */
const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
const tokenOverlap = (a, b) => {
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  return [...ta].filter((t) => tb.has(t)).length / Math.max(ta.size, tb.size);
};
function tooClose(candidate, other) {
  const nf = norm(candidate);
  const nr = norm(other);
  if (nf === nr) return true;
  const limit = Math.min(nf.length, nr.length) <= 5 ? 1 : Math.min(nf.length, nr.length) <= 11 ? 2 : 3;
  return editDistance(nf, nr) <= limit || tokenOverlap(candidate, other) >= 0.8;
}

/** lib/data.ts·validate-pool.mjs와 같은 규칙 */
const ADMIN_NOISE =
  /관리사무소|\d{3,}\s*동|제\s*\d|\d+\s*구역|임대|\d+\s*호(?!반|텔)|주택도시공사|도시개발공사|SH공사/;

/* ---------- 재료 ---------- */
const pieces = read("name_pieces.json");
const reals = read("apartments.json").items;
const fakeFile = read("fake_names.json");

/**
 * 지역어. 실단지의 동 이름에서 뽑는다 ("방이동" → "방이").
 * 지어내지 않는 이유: 없는 동네 이름은 그 지역 사람이 바로 알아본다.
 */
const areaWords = new Map();
for (const a of reals) {
  const d = String(a.dong ?? "").replace(/(\d+)?(동|읍|면|가)$/, "").trim();
  if (d.length >= 2 && d.length <= 4 && /^[가-힣]+$/.test(d)) areaWords.set(d, (areaWords.get(d) ?? 0) + 1);
}

/** 사전. 긴 낱말부터 맞춰야 "센트럴파크"가 "센트럴"+"파크"로 쪼개진다 */
const LEX = [
  ...pieces.brands.map((w) => [w, "브랜드"]),
  ...pieces.oldMakers.map((w) => [w, "제조사"]),
  ...pieces.place.map((w) => [w, "입지"]),
  ...pieces.grade.map((w) => [w, "격"]),
  ...pieces.korean.map((w) => [w, "우리말"]),
  ...[...areaWords.keys()].map((w) => [w, "지역"]),
].sort((a, b) => b[0].length - a[0].length);

/**
 * 이름 하나를 사전으로 토막 낸다. 앞에서부터 가장 긴 것을 집는다.
 * 남는 글자가 있으면 배우지 않는다 — 어설프게 쪼갠 것으로 틀을 만들면
 * 그 틀이 만들어 내는 이름도 어설프다.
 */
function segment(name) {
  const bare = name.replace(/\s+/g, "");
  const out = [];
  let i = 0;
  while (i < bare.length) {
    const hit = LEX.find(([w]) => bare.startsWith(w, i));
    if (!hit) return null;
    out.push(hit);
    i += hit[0].length;
  }
  return out.length >= 2 ? out : null;
}

/* ---------- 1. 실단지에서 틀과 분포를 배운다 ---------- */
const shapes = new Map(); // "지역>브랜드" → { n, spaced }
const lenDist = new Map(); // 글자 수 → 건수
const wordFreq = new Map(); // "종류|낱말" → 건수
/**
 * 실단지에서 실제로 **붙어 본 적 있는** 낱말 짝. "쌍용래미안"처럼 남의 회사
 * 브랜드 둘을 잇거나 "마천행당"처럼 서로 먼 동네 이름을 잇는 것을 막는다.
 *
 * 규칙을 손으로 적지 않는 이유: "브랜드와 제조사를 같이 쓰지 마라"고 적으면
 * "○○현대힐스테이트"처럼 실제로 있는 이름까지 막힌다(힐스테이트가 현대의
 * 브랜드다). 어느 조합이 말이 되는지는 실단지가 이미 알고 있다.
 */
const pairSeen = new Set(); // "앞낱말|뒷낱말"
const initialSeen = new Set(); // 맨 앞에 와 본 낱말
const finalSeen = new Set(); // 맨 뒤에 와 본 낱말

for (const a of reals) {
  const name = String(a.name).trim();
  lenDist.set(name.replace(/\s+/g, "").length, (lenDist.get(name.replace(/\s+/g, "").length) ?? 0) + 1);
  const seg = segment(name);
  if (!seg) continue;
  const key = seg.map(([, kind]) => kind).join(">");
  const rec = shapes.get(key) ?? { n: 0, spaced: 0 };
  rec.n++;
  if (/\s/.test(name)) rec.spaced++;
  shapes.set(key, rec);
  for (const [w, kind] of seg) wordFreq.set(`${kind}|${w}`, (wordFreq.get(`${kind}|${w}`) ?? 0) + 1);
  for (let i = 1; i < seg.length; i++) pairSeen.add(`${seg[i - 1][0]}|${seg[i][0]}`);
  initialSeen.add(seg[0][0]);
  finalSeen.add(seg[seg.length - 1][0]);
}

/** 종류별 낱말 목록을 실단지 빈도로 가중해 둔다. 흔한 말이 흔하게 나와야 한다 */
const byKind = new Map();
for (const [key, n] of wordFreq) {
  const [kind, w] = key.split("|");
  if (!byKind.has(kind)) byKind.set(kind, []);
  byKind.get(kind).push([w, n]);
}

/** 두 번 이하로 쓰인 틀은 배우지 않는다 — 우연히 쪼개진 것이 섞인다 */
const shapeChoices = [...shapes.entries()].filter(([, r]) => r.n >= 3).map(([k, r]) => [k, r.n]);
if (!shapeChoices.length) {
  console.error("실단지에서 틀을 하나도 못 배웠다. 어휘 사전(data/name_pieces.json)을 확인하라.");
  process.exit(1);
}

const lenChoices = [...lenDist.entries()].filter(([l]) => l >= 4 && l <= 20);
const lenTotal = lenChoices.reduce((s, [, n]) => s + n, 0);
/** 그 길이가 실단지에서 얼마나 흔한가 (0~1). 뽑은 뒤 이 확률로 받아들인다 */
const lenWeight = new Map(lenChoices.map(([l, n]) => [l, n / lenTotal]));
const lenMax = Math.max(...lenWeight.values());

/* ---------- 2. 뽑는다 ---------- */
const existingFakes = fakeFile.items.map((f) => f.name);
const seen = new Set([...reals, ...fakeFile.items].map((x) => norm(x.name)));
/**
 * 글자 수로 묶어 둔다. 후보마다 15,837건을 전부 훑으면 못 쓸 만큼 느리다.
 * 편집거리는 길이가 4보다 많이 차이나면 볼 것도 없으므로(editDistance가
 * 그때 바로 99를 돌려준다) ±4 구간만 본다. 앞글자로 묶으면 안 된다 —
 * "독산청구"와 "오산청구"는 앞글자가 다른데도 거리 1이다.
 */
const realByLen = new Map();
for (const r of reals) {
  const l = norm(r.name).length;
  if (!realByLen.has(l)) realByLen.set(l, []);
  realByLen.get(l).push(r.name);
}
const realsNear = (len) => {
  const out = [];
  for (let l = len - 4; l <= len + 4; l++) out.push(...(realByLen.get(l) ?? []));
  return out;
};

function build() {
  const key = weighted(shapeChoices);
  const kinds = key.split(">");
  const rec = shapes.get(key);
  const words = kinds.map((kind) => {
    const list = byKind.get(kind);
    return list && list.length ? weighted(list) : null;
  });
  if (words.some((w) => !w)) return null;
  // 같은 낱말이 두 번 들어간 이름은 실단지에 거의 없다
  if (new Set(words).size !== words.length) return null;
  // 맨 앞·맨 뒤 자리는 실단지에서 그 자리에 와 본 낱말만 쓴다. "아이파크 동삼 더"처럼
  // 접두사로만 쓰이는 말("더")로 이름이 끝나는 것을 막는다
  if (!initialSeen.has(words[0]) || !finalSeen.has(words[words.length - 1])) return null;
  // 동네 이름이 낀 이음매만 자유다 — 어느 동네에나 어느 브랜드든 들어설 수 있고,
  // 그 자리가 조합을 넓히는 유일한 자리다. 나머지 이음매는 실단지에 그 짝이
  // 있어야 한다. 이걸 안 걸면 "쌍용래미안"(남의 회사 둘) · "마을타운"(같은 뜻
  // 두 번) · "리더스금호"(격이 회사 앞에) 같은 것이 나온다.
  for (let i = 1; i < words.length; i++) {
    // 한쪽만 동네일 때가 자유다. 양쪽 다 동네면 "옥련신천"처럼 서로 먼 두
    // 동네를 잇게 된다 — 어휘 사전이 동 이름을 넉넉히 잡다 보니 토막내기가
    // 지역>지역으로 잘못 읽은 자리가 섞여 있어서, 그 틀이 그대로 흘러나온다
    const free = (kinds[i - 1] === "지역") !== (kinds[i] === "지역");
    if (!free && !pairSeen.has(`${words[i - 1]}|${words[i]}`)) return null;
  }
  // 띄어쓰기도 그 틀의 실제 비율대로. 이걸 안 하면 공백만 세도 가짜가 드러난다
  const spaced = rand() < rec.spaced / rec.n;
  return { name: spaced ? words.join(" ") : words.join(""), shape: key };
}

const added = [];
const why = { 짧거나긺: 0, 길이분포: 0, 관리단위: 0, 이미있음: 0, 실단지와가까움: 0, 가짜와가까움: 0, 말거르기: 0 };
let tries = 0;
const room = Math.max(0, Math.min(MAX, TARGET - fakeFile.items.length));

const { screenName } = room ? await import("../lib/wordguard.ts") : { screenName: () => ({ verdict: "pass" }) };

while (added.length < room && tries < room * 400) {
  tries++;
  const made = build();
  if (!made) continue;
  const { name, shape } = made;
  const bare = norm(name);
  if (bare.length < 4 || bare.length > 20) { why.짧거나긺++; continue; }
  // 실단지 길이 분포를 따른다. 흔한 길이는 잘 받고, 드문 길이는 드물게 받는다
  if (rand() > (lenWeight.get(bare.length) ?? 0) / lenMax) { why.길이분포++; continue; }
  if (ADMIN_NOISE.test(name)) { why.관리단위++; continue; }
  if (seen.has(bare)) { why.이미있음++; continue; }
  if (screenName(name).verdict !== "pass") { why.말거르기++; continue; }
  if (realsNear(bare.length).some((r) => tooClose(name, r))) { why.실단지와가까움++; continue; }
  if ([...existingFakes, ...added.map((a) => a.name)].some((f) => tooClose(name, f))) { why.가짜와가까움++; continue; }
  seen.add(bare);
  added.push({ name, shape });
}

/* ---------- 3. 적는다 ---------- */
const spacedCount = (list) => list.filter((n) => /\s/.test(n)).length;
console.log(`시도 ${tries}회 → ${added.length}건 (여유 ${room}건, 풀 ${fakeFile.items.length} / 목표 ${TARGET})`);
console.log(`  버린 사유: ${Object.entries(why).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ") || "없음"}`);

/*
 * 띄어쓰기 비율은 **풀 전체**로 봐야 한다. 한 번에 넣는 몇십 건만 보면 뜻이 없다.
 *
 * 왜 보는가: 기존 523건은 띄어쓴 것이 49.6%인데 실단지는 15.9%였다. 이름을
 * 읽지 않고 공백만 세도 76% 맞힐 수 있었다는 뜻이다. 새로 넣는 것은 틀마다
 * 실단지가 그 틀을 띄어 쓰는 비율을 그대로 따르므로, 쌓일수록 풀 전체가
 * 실단지 쪽으로 끌려간다. 그 수치가 여기 찍힌다 — 멀어지면 틀이 한쪽으로
 * 쏠린 것이니 어휘를 손볼 때가 된 것이다.
 */
const realRate = spacedCount(reals.map((r) => r.name)) / reals.length;
const poolNames = [...fakeFile.items.map((f) => f.name), ...added.map((a) => a.name)];
const poolRate = poolNames.length ? spacedCount(poolNames) / poolNames.length : 0;
console.log(
  `  띄어쓴 비율: 가짜 풀 ${(poolRate * 100).toFixed(1)}% · 실단지 ${(realRate * 100).toFixed(1)}% ` +
    `(새로 넣는 것 ${added.length ? ((spacedCount(added.map((a) => a.name)) / added.length) * 100).toFixed(1) : "0.0"}%)`,
);

/*
 * 짧은 이름의 통과율. 실단지가 15,837건이라 4~6자 조합은 대부분 이미 실존이고,
 * 늘어날수록 더 막힌다. 여기가 0에 가까워지면 짧은 가짜를 못 만든다는 뜻이고,
 * 그러면 길이가 곧 정답 힌트가 된다 — 그때는 사람이 손을 써야 한다.
 */
const shortMade = added.filter((a) => norm(a.name).length <= 6).length;
console.log(`  짧은 이름(6자 이하): 새로 넣는 것 중 ${shortMade}건 · 실단지 ${(reals.filter((r) => norm(r.name).length <= 6).length / reals.length * 100).toFixed(1)}%`);

if (!added.length) {
  console.log("새로 넣을 이름이 없다. 파일을 건드리지 않는다.");
  process.exit(0);
}

let nextId = fakeFile.items.reduce((max, f) => {
  const m = /^g(\d+)$/.exec(String(f.id));
  return m ? Math.max(max, Number(m[1])) : max;
}, 0);

for (const a of added) {
  fakeFile.items.push({
    id: `g${String(++nextId).padStart(3, "0")}`,
    name: a.name,
    // 정답 공개 화면에 그대로 뜬다. 어떤 틀로 지었는지는 밝히지 않는다 —
    // 틀을 알려 주면 그다음부터는 틀을 외워서 맞힌다
    hint: "실단지에 없는 조합입니다",
    difficulty: norm(a.name).length <= 6 ? "hard" : a.shape.split(">").length >= 3 ? "easy" : "mid",
  });
  console.log(`  + ${a.name}  (${a.shape})`);
}

if (DRY) {
  console.log("\n--dry 라서 파일은 그대로 둔다.");
  process.exit(0);
}
fs.writeFileSync(path.join(WEB, "data/fake_names.json"), `${JSON.stringify(fakeFile, null, 2)}\n`);
console.log(`\n출제 풀 가짜 ${fakeFile.items.length}건. 다음: npm run validate-pool`);
