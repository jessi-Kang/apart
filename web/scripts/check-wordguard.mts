/**
 * 말 거르기 사전 검증.
 *
 * 사전을 늘릴 때마다 이걸 돌린다. 두 가지를 본다.
 *
 *   오탐   실단지 12,121건과 이미 쓰는 가짜 523건이 하나라도 걸리면 실패다.
 *          멀쩡한 단지명을 막는 사전은 없느니만 못하다 — "성당"을 넣었다가
 *          대구 성당동 단지가 줄줄이 걸린 적이 있다.
 *   미탐   막아야 할 표본이 정말 막히는가. 우회 표기(숫자 끼우기, 글자 늘이기,
 *          공백 넣기)까지 같이 던져 본다.
 *
 * Node가 타입을 떼고 바로 돌린다(--experimental-strip-types). 사전을 JSON으로
 * 빼서 스크립트가 따로 읽게 하면 규칙이 두 벌이 되고 반드시 갈라진다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { screenName } from "../lib/wordguard.ts";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(WEB, "data", f), "utf8")).items as { name: string }[];

/** 막혀야 하는 표본. 원문과 흔한 우회 표기를 함께 넣는다 */
const MUST_BLOCK = [
  "씨발타워",
  "시1발파크",
  "씨이이발힐스",
  "씨 발 아파트",
  "개새끼빌라",
  "병신맨션",
  "FuckTower",
  "fuck the park",
  "개1새끼힐스",
  "병1신타워",
  "씨   발 파크",
  "쪽바리마을",
  "짱깨타운",
  "틀딱아파트",
  "섹스빌리지",
  "강간의집",
];

/** 사람이 봐야 하는 표본 */
const MUST_REVIEW = [
  "달동네뷰",
  "무덤가든",
  "붕괴하이츠",
  "전세사기캐슬",
  "마약파크",
  "미친가격",
  "흙수저타운",
  "부동산경매파크",
  "귀신들린집",
];

/** 그냥 통과해야 하는 표본 (평범한 이름) */
const MUST_PASS = [
  "래미안 원베일리",
  "힐스테이트 센트럴",
  "성당동 그린빌",
  "부처울 한신",
  "암사동 프라이어팰리스",
  "서민복지아파트라고 적진 않지만 긴 이름",
  "e편한세상 시티",
  "문경매봉2",
  "가야동원로얄듀크",
  "경희궁자이3단지",
  "일도신천지아파트",
  "한성기린프라자",
  "동아서광성지진덕",
];

let failed = 0;
const bad = (line: string) => {
  console.log(`실패  ${line}`);
  failed++;
};

/* 1. 오탐 — 실단지와 기존 가짜는 전부 통과해야 한다 */
for (const [label, file] of [
  ["실단지", "apartments.json"],
  ["가짜", "fake_names.json"],
] as const) {
  const rows = read(file);
  const hits = rows
    .map((r) => ({ name: r.name, s: screenName(r.name) }))
    .filter((x) => x.s.verdict !== "pass");
  if (hits.length) {
    bad(`[오탐] ${label} ${rows.length}건 중 ${hits.length}건이 걸렸다`);
    for (const h of hits.slice(0, 20)) {
      console.log(`        ${h.name} → ${h.s.verdict} (${h.s.group}: ${h.s.hit})`);
    }
    if (hits.length > 20) console.log(`        … 그 밖 ${hits.length - 20}건`);
  } else {
    console.log(`  OK  [오탐] ${label} ${rows.length}건 전부 통과`);
  }
}

/* 2. 미탐 — 막아야 할 것이 막히는가 */
for (const [want, samples] of [
  ["block", MUST_BLOCK],
  ["review", MUST_REVIEW],
  ["pass", MUST_PASS],
] as const) {
  const wrong = samples
    .map((n) => ({ n, s: screenName(n) }))
    .filter((x) => x.s.verdict !== want);
  if (wrong.length) {
    bad(`[미탐] ${want}이어야 하는데 아닌 것 ${wrong.length}건`);
    for (const w of wrong) console.log(`        ${w.n} → ${w.s.verdict}`);
  } else {
    console.log(`  OK  [미탐] ${want} 표본 ${samples.length}건 전부 맞음`);
  }
}

console.log(failed ? `\n실패 ${failed}건` : "\n사전 검증 통과");
process.exit(failed ? 1 : 0);
