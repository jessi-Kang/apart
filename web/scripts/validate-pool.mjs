#!/usr/bin/env node
/**
 * 출제 풀 검증 (docs/03 §2-3 자동 필터)
 *
 *   node scripts/validate-pool.mjs
 *
 * 검사 항목:
 *  1. 가짜 이름이 실단지명과 완전 일치하면 실패
 *  2. 가짜 이름이 실단지명과 너무 가까우면 실패 (편집거리 임계는 길이 비례,
 *     토큰 일치율 ≥ 80%)
 *     ("사실상 실존"인 가짜는 정답 시비를 만든다)
 *  3. 블랙리스트 단어(지역 비하·비속어 계열) 포함 시 실패
 *  4. 형식: 길이 4~20자, 중복 id/이름 없음, 필수 필드 존재
 *
 * CI와 로컬에서 데이터 교체 때마다 돌린다. 실패 시 exit 1.
 */

import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const real = JSON.parse(fs.readFileSync(path.join(dataDir, "apartments.json"), "utf8")).items;
const fake = JSON.parse(fs.readFileSync(path.join(dataDir, "fake_names.json"), "utf8")).items;

// 운영하며 계속 추가한다 (docs/03). 커밋 메시지·데이터에 실단어를 늘어놓지
// 않도록 최소 시드만 코드에 둔다.
const BLACKLIST = ["촌동네", "달동네", "빈민", "서민만"];

const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99; // 조기 종료: 주의 구간(≤4)보다 확실히 먼 값 반환
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

function tokenOverlap(a, b) {
  const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

const errors = [];
const warn = [];

// 4. 형식/중복
for (const pool of [real, fake]) {
  const ids = new Set(), names = new Set();
  for (const it of pool) {
    if (!it.id || !it.name) errors.push(`필수 필드 누락: ${JSON.stringify(it).slice(0, 60)}`);
    if (ids.has(it.id)) errors.push(`중복 id: ${it.id}`);
    if (names.has(norm(it.name))) errors.push(`중복 이름: ${it.name}`);
    ids.add(it.id); names.add(norm(it.name));
    if (it.name.length < 2 || it.name.length > 20) errors.push(`길이 위반: ${it.name}`);
  }
}
for (const r of real) {
  if (!r.sido || !r.sigungu || !r.builtYear || !r.households)
    errors.push(`실단지 메타 결측: ${r.name}`);
}

// 1~3. 가짜 대조
for (const f of fake) {
  if (!f.hint) errors.push(`힌트 누락: ${f.name}`);
  for (const word of BLACKLIST) if (f.name.includes(word)) errors.push(`블랙리스트 위반: ${f.name} (${word})`);
  for (const r of real) {
    const nf = norm(f.name), nr = norm(r.name);
    if (nf === nr) { errors.push(`실존 일치: ${f.name}`); continue; }
    const dist = editDistance(nf, nr);
    // 임계를 길이에 비례시킨다. 절대값 2로 재면 "송파현대 ↔ 면목현대"처럼
    // 지역이 다른(= 명백히 다른 단지인) 짧은 이름까지 전부 반려돼,
    // 실단지의 600건 넘는 4~5자 구간을 가짜가 아예 채울 수 없다.
    const limit = Math.min(nf.length, nr.length) <= 5 ? 1 : Math.min(nf.length, nr.length) <= 11 ? 2 : 3;
    if (dist <= limit) errors.push(`실단지와 편집거리 ${dist}(한계 ${limit}): "${f.name}" ↔ "${r.name}"`);
    else if (tokenOverlap(f.name, r.name) >= 0.8) errors.push(`토큰 일치율 80%+: "${f.name}" ↔ "${r.name}"`);
    else if (dist <= 4) warn.push(`유사 주의(거리 ${dist}): "${f.name}" ↔ "${r.name}"`);
  }
}

for (const w of warn) console.error("주의:", w);
if (errors.length) {
  for (const e of errors) console.error("실패:", e);
  console.error(`\n검증 실패 ${errors.length}건. 데이터를 수정한 뒤 다시 실행하세요.`);
  process.exit(1);
}
console.error(`검증 통과: 실단지 ${real.length}건, 가짜 ${fake.length}건 (주의 ${warn.length}건)`);
