#!/usr/bin/env node
/**
 * K-apt 공동주택 단지 수집 스크립트 (docs/03 §1)
 *
 * 사용법:
 *   KAPT_API_KEY=<공공데이터포털 인증키> node scripts/collect-kapt.mjs [시도코드...]
 *
 * 공공데이터포털 "공동주택 단지 목록제공 서비스"(AptListService3)의
 * 시도 단위 목록(getSidoAptList3)과 "공동주택 기본 정보"(AptBasisInfoServiceV3,
 * getAphusBassInfoV3)를 호출해 data/apartments.collected.json 을 생성한다.
 * 검토 후 data/apartments.json 으로 승격하는 2단계 구조 — 수집 결과를
 * 무검토로 출제 풀에 넣지 않는다 (docs/03 §4-2).
 *
 * 정제 규칙 (docs/03 §1-2):
 *  - 단지명 정규화(공백·괄호 병기 제거), 차수 중복은 대표 1건
 *  - 세대수·준공년도 결측 단지는 제외 (정답 공개 화면을 채울 수 없음)
 *  - 난이도 초기 라벨은 규칙 기반(토큰 수·펫네임 수), 이후 실측으로 갱신
 */

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.KAPT_API_KEY;
const BASE_LIST = "https://apis.data.go.kr/1613000/AptListService3/getSidoAptList3";
const BASE_INFO = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfoV3";
const OUT = path.join(process.cwd(), "data", "apartments.collected.json");

// 인자 없으면 서울(11)만. 시도코드: 행정표준코드 앞 2자리
const SIDO_CODES = process.argv.slice(2).length ? process.argv.slice(2) : ["11"];

const PET_NAMES = ["포레", "에듀", "노블", "퍼스티지", "센트럴", "리버", "레이크", "파크", "어반", "블리스", "그랑", "스카이", "뷰", "시티", "베뉴", "포레스트", "클래스"];

if (!KEY) {
  console.error(
    [
      "KAPT_API_KEY가 없습니다.",
      "1) https://www.data.go.kr 에서 '공동주택 단지 목록제공 서비스' 활용 신청",
      "2) KAPT_API_KEY=<인증키> node scripts/collect-kapt.mjs",
      "수집 결과는 data/apartments.collected.json 에 저장되며, 검토 후",
      "data/apartments.json 으로 승격합니다.",
    ].join("\n"),
  );
  process.exit(1);
}

function normalizeName(raw) {
  return raw
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 차수 표기 제거한 대표 키 ("래미안OO 1차" → "래미안OO") */
function familyKey(name) {
  return name.replace(/\s*\d+(차|단지)$/g, "").trim();
}

function difficultyOf(name) {
  const tokens = name.split(" ");
  const petCount = PET_NAMES.filter((p) => name.includes(p)).length;
  if (petCount >= 2 || tokens.length >= 4) return "hard";
  if (petCount === 1 || tokens.length === 3) return "mid";
  return "easy";
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function listSido(sidoCode) {
  const items = [];
  for (let page = 1; ; page++) {
    const url = `${BASE_LIST}?serviceKey=${encodeURIComponent(KEY)}&sidoCode=${sidoCode}&pageNo=${page}&numOfRows=1000&_type=json`;
    const json = await getJson(url);
    const body = json?.response?.body;
    const rows = body?.items?.item ?? [];
    items.push(...(Array.isArray(rows) ? rows : [rows]));
    if (page * 1000 >= Number(body?.totalCount ?? 0)) break;
  }
  return items;
}

async function basisInfo(kaptCode) {
  const url = `${BASE_INFO}?serviceKey=${encodeURIComponent(KEY)}&kaptCode=${kaptCode}&_type=json`;
  const json = await getJson(url);
  return json?.response?.body?.item ?? null;
}

const seen = new Map(); // familyKey → item
let scanned = 0;

for (const sido of SIDO_CODES) {
  const list = await listSido(sido);
  console.error(`시도 ${sido}: 목록 ${list.length}건`);
  for (const row of list) {
    scanned++;
    const name = normalizeName(String(row.kaptName ?? ""));
    if (!name || seen.has(familyKey(name))) continue;
    const info = await basisInfo(row.kaptCode);
    if (!info) continue;
    const households = Number(info.kaptdaCnt ?? 0);
    const useDate = String(info.kaptUsedate ?? ""); // YYYYMMDD
    const builtYear = Number(useDate.slice(0, 4));
    if (!households || !builtYear) continue; // 결측 제외
    seen.set(familyKey(name), {
      id: `k${row.kaptCode}`,
      name,
      sido: String(info.as1 ?? row.as1 ?? ""),
      sigungu: String(info.as2 ?? row.as2 ?? ""),
      dong: String(info.as3 ?? row.as3 ?? ""),
      builtYear,
      households,
      difficulty: difficultyOf(name),
    });
    if (seen.size % 100 === 0) console.error(`정제 통과 ${seen.size}건 (스캔 ${scanned})`);
  }
}

const items = [...seen.values()];
fs.writeFileSync(
  OUT,
  JSON.stringify(
    { _note: `K-apt 수집본 ${new Date().toISOString().slice(0, 10)}. 검토 후 apartments.json으로 승격.`, items },
    null,
    2,
  ),
);
console.error(`완료: ${items.length}건 → ${OUT}`);
console.error("다음: node scripts/validate-pool.mjs 로 대조 검증 후 apartments.json 교체");
