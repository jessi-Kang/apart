#!/usr/bin/env node
/**
 * 가짜 이름 후보 검사기.
 *
 *   node scripts/check-fakes.mjs candidates.json [--json 통과분출력.json]
 *
 * 왜 따로 있나: validate-pool.mjs는 이미 등록된 풀을 검사한다. 후보를
 * 먼저 넣어 보고 실패하면 빼는 식으로 쓰면, 실패한 이름이 잠깐이라도
 * fake_names.json에 들어갔다가 나온다. 후보는 등록 전에 거른다.
 *
 * 검사 규칙은 validate-pool과 같아야 한다 — 여기만 느슨하면 통과시킨
 * 이름이 등록 직후 본 검사에서 떨어진다. 임계값을 고칠 때는 둘 다 고친다.
 *
 * 후보 파일 형식: [{ "name": "...", "hint": "...", "difficulty": "mid" }, ...]
 */

import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const real = JSON.parse(fs.readFileSync(path.join(dataDir, "apartments.json"), "utf8")).items;
const fake = JSON.parse(fs.readFileSync(path.join(dataDir, "fake_names.json"), "utf8")).items;
const candFile = process.argv[2];
if (!candFile) {
  console.error("사용법: node scripts/check-fakes.mjs candidates.json [--json out.json]");
  process.exit(2);
}
const cands = JSON.parse(fs.readFileSync(candFile, "utf8"));
const outIdx = process.argv.indexOf("--json");
const outFile = outIdx > 0 ? process.argv[outIdx + 1] : null;

const BLACKLIST = ["촌동네", "달동네", "빈민", "서민만"];
const ADMIN_NOISE =
  /관리사무소|\d{3,}\s*동|제\s*\d|\d+\s*구역|임대|\d+\s*호(?!반|텔)|주택도시공사|도시개발공사|SH공사/;
const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
const tokenOverlap = (a, b) => {
  const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
  return [...ta].filter((t) => tb.has(t)).length / Math.max(ta.size, tb.size);
};

// 길이가 비슷한 실단지만 재면 12,000건 × 수백 건도 금방 끝난다
const byLen = new Map();
for (const r of real) {
  const k = norm(r.name).length;
  for (const d of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
    const bucket = byLen.get(k + d) ?? [];
    bucket.push(r);
    byLen.set(k + d, bucket);
  }
}

const taken = new Set([...fake.map((f) => norm(f.name)), ...real.map((r) => norm(r.name))]);
const pass = [];
const fail = [];

for (const c of cands) {
  const name = String(c.name ?? "").trim();
  const why = [];
  if (!name || !c.hint) why.push("필수 필드 누락");
  if (name.length < 4 || name.length > 20) why.push(`길이 ${name.length}`);
  if (ADMIN_NOISE.test(name)) why.push("관리 단위로 읽힘");
  for (const w of BLACKLIST) if (name.includes(w)) why.push(`블랙리스트 ${w}`);
  const nf = norm(name);
  if (taken.has(nf)) why.push("이미 있는 이름");
  for (const r of byLen.get(nf.length) ?? []) {
    const nr = norm(r.name);
    if (nf === nr) { why.push(`실존 일치: ${r.name}`); break; }
    const dist = editDistance(nf, nr);
    const limit = Math.min(nf.length, nr.length) <= 5 ? 1 : Math.min(nf.length, nr.length) <= 11 ? 2 : 3;
    if (dist <= limit) { why.push(`편집거리 ${dist}(한계 ${limit}) ↔ ${r.name}`); break; }
    if (tokenOverlap(name, r.name) >= 0.8) { why.push(`토큰 일치 ↔ ${r.name}`); break; }
  }
  if (why.length) fail.push({ name, why: why[0] });
  else {
    taken.add(nf); // 후보끼리도 겹치면 안 된다
    pass.push({ name, hint: c.hint, difficulty: c.difficulty ?? "mid" });
  }
}

// 이 이름이 어느 구역에서 나올 수 있는지 (lib/data.ts의 regionTokens와 같은 계산).
// 지역 이름이 하나도 없으면 어디서나 나온다 — 지금 가장 아쉬운 것이 그쪽이다.
const guKey = (sido, sigungu) => `${sido}|${sigungu}`;
const regionTokens = new Map();
const addTok = (t, k) => {
  if (!t || t.length < 2) return;
  let set = regionTokens.get(t);
  if (!set) regionTokens.set(t, (set = new Set()));
  set.add(k);
};
for (const a of real) {
  const key = guKey(a.sido, a.sigungu);
  const dong = a.dong.replace(/\d+가$/, "").replace(/\d/g, "");
  const bare = dong.replace(/[동로]$/, "");
  addTok(dong, key);
  addTok(bare, key);
  addTok(bare.replace(/^[상하신구동서남북중]/, ""), key);
  addTok(a.sigungu, key);
  addTok(a.sigungu.replace(/구$/, ""), key);
}
const sidosOf = (name) => {
  const flat = name.replace(/\s+/g, "");
  const found = [];
  for (const [t, gus] of regionTokens) if (flat.includes(t)) found.push([...gus]);
  if (!found.length) return null; // 어디서나
  const allowed = found.reduce((acc, gus) => acc.filter((g) => gus.includes(g)));
  return [...new Set(allowed.map((g) => g.split("|")[0]))];
};
const free = [];
const bound = new Map();
for (const p of pass) {
  const s = sidosOf(p.name);
  if (s === null) free.push(p.name);
  else if (s.length === 0) bound.set("(어디에도 못 씀)", (bound.get("(어디에도 못 씀)") ?? 0) + 1);
  else for (const sido of s) bound.set(sido, (bound.get(sido) ?? 0) + 1);
}

for (const f of fail) console.error(`반려: ${f.name} — ${f.why}`);
console.error(`\n후보 ${cands.length}건 → 통과 ${pass.length} / 반려 ${fail.length}`);
console.error(`지역색 없음(어디서나): ${free.length}건`);
if (bound.size) console.error("구역에 묶임: " + [...bound].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(pass, null, 2));
  console.error(`통과분 → ${outFile}`);
}
