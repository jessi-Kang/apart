#!/usr/bin/env node
/**
 * 수집본을 출제 풀로 승격한다.
 *
 * 왜 덮어쓰지 않고 더하는가. apartments.json에는 수집본에 없는 단지가 손으로
 * 들어가 있다(압구정 현대처럼 목록 API가 빠뜨리거나 이름이 달리 잡힌 것들).
 * 승격을 복사로 만들면 매일 밤 그것들이 조용히 사라진다 — 실제로 승격본에만
 * 있는 행이 6건 있었다. 그래서 승격은 더하기다: 이미 있는 것은 그대로 두고
 * 수집본에서 새로 보이는 것만 넣는다.
 *
 * 겹침은 두 잣대로 본다.
 *   id        같은 kaptCode면 같은 단지다.
 *   familyKey 차수 표기와 공백을 뗀 이름. 같은 단지가 다른 코드로 두 번
 *             들어오는 일이 있어서, 수집 스크립트와 같은 규칙으로 한 번 더 본다.
 *
 * 넣은 뒤에는 반드시 validate-pool로 검증한다. 이 스크립트는 파일만 만들고
 * 판단하지 않는다.
 */

import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const SRC = path.join(DATA, "apartments.collected.json");
const DST = path.join(DATA, "apartments.json");
const FAKE = path.join(DATA, "fake_names.json");

const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

/** validate-pool.mjs와 같아야 한다. 갈라지면 여기서 통과한 것이 거기서 막힌다 */
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
const tooClose = (fakeName, realName) => {
  const nf = norm(fakeName);
  const nr = norm(realName);
  if (nf === nr) return true;
  const limit = Math.min(nf.length, nr.length) <= 5 ? 1 : Math.min(nf.length, nr.length) <= 11 ? 2 : 3;
  return editDistance(nf, nr) <= limit || tokenOverlap(fakeName, realName) >= 0.8;
};

/**
 * 새로 들어온 실단지와 너무 가까워진 가짜를 뺀다.
 *
 * 왜 필요한가. 가짜는 그때그때의 실단지 목록에 대고 검증해 만든 것이라,
 * 실단지가 늘면 어제까지 멀쩡하던 가짜가 오늘 "사실상 실존"이 된다. 실제로
 * 부산·대구·인천을 받자마자 "창동청솔맨션"이 "우방청솔맨션"과 거리 2가 됐다.
 * 그대로 두면 validate-pool이 막고, 야간 작업은 매일 밤 같은 자리에서 멈춘다.
 *
 * 어느 쪽을 빼는가. 가짜다. 실단지는 사실이고 가짜는 지어낸 것이라, 겹치면
 * 지어낸 쪽이 물러나는 것이 맞다. 가짜를 빼서 생기는 손해는 풀이 조금 줄어드는
 * 것뿐이지만, 남겨 두면 "이거 진짜 있는데요?" 하는 정답 시비가 된다.
 */
function pruneFakes(reals) {
  const file = JSON.parse(fs.readFileSync(FAKE, "utf8"));
  const dropped = [];
  const kept = file.items.filter((f) => {
    const clash = reals.find((r) => tooClose(f.name, r.name));
    if (clash) {
      dropped.push([f.name, clash.name, Boolean(f.coined)]);
      return false;
    }
    return true;
  });
  if (!dropped.length) return dropped;
  file.items = kept;
  fs.writeFileSync(FAKE, `${JSON.stringify(file, null, 2)}\n`);
  return dropped;
}

/** collect-kapt.mjs의 것과 같아야 한다. 갈라지면 같은 단지를 두 번 넣는다 */
const familyKey = (name) => name.replace(/\s*\d+(차|단지)$/g, "").replace(/\s+/g, "").toLowerCase();

if (!fs.existsSync(SRC)) {
  console.log("수집본이 없다. 승격할 것이 없다.");
  process.exit(0);
}

const src = JSON.parse(fs.readFileSync(SRC, "utf8")).items ?? [];
const dstFile = JSON.parse(fs.readFileSync(DST, "utf8"));
const dst = dstFile.items ?? [];

const ids = new Set(dst.map((a) => a.id));
const keys = new Set(dst.map((a) => familyKey(a.name)));

const added = [];
for (const a of src) {
  if (ids.has(a.id) || keys.has(familyKey(a.name))) continue;
  ids.add(a.id);
  keys.add(familyKey(a.name));
  added.push(a);
}

if (added.length) {
  dstFile.items = [...dst, ...added];
  fs.writeFileSync(DST, `${JSON.stringify(dstFile, null, 2)}\n`);
} else {
  console.log("새로 승격할 단지가 없다.");
}

// 승격 여부와 무관하게 늘 본다. 앞선 실행이 실단지만 넣고 멈췄을 수 있다
const dropped = pruneFakes(dstFile.items);
if (dropped.length) {
  console.log(`\n실단지와 가까워진 가짜 ${dropped.length}건을 뺐다.`);
  for (const [fake, real, coined] of dropped) {
    console.log(`  - ${fake} (실단지 "${real}"와 겹침)${coined ? " ※ 사람이 지은 이름" : ""}`);
  }
}

if (!added.length && !dropped.length) process.exit(0);

const bySido = {};
for (const a of added) bySido[a.sido || "?"] = (bySido[a.sido || "?"] || 0) + 1;
if (added.length) console.log(`\n${added.length}건을 출제 풀로 승격했다 (전체 ${dstFile.items.length}건).`);
for (const [sido, n] of Object.entries(bySido).sort((x, y) => y[1] - x[1])) console.log(`  ${sido} ${n}건`);
console.log("\n다음: npm run validate-pool 으로 검증한다.");
