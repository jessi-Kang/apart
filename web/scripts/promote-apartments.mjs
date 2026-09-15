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

if (!added.length) {
  console.log("새로 승격할 단지가 없다. 파일을 건드리지 않는다.");
  process.exit(0);
}

dstFile.items = [...dst, ...added];
fs.writeFileSync(DST, `${JSON.stringify(dstFile, null, 2)}\n`);

const bySido = {};
for (const a of added) bySido[a.sido || "?"] = (bySido[a.sido || "?"] || 0) + 1;
console.log(`${added.length}건을 출제 풀로 승격했다 (전체 ${dstFile.items.length}건).`);
for (const [sido, n] of Object.entries(bySido).sort((x, y) => y[1] - x[1])) console.log(`  ${sido} ${n}건`);
console.log("\n다음: npm run validate-pool 으로 검증한다.");
