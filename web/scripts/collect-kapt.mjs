#!/usr/bin/env node
/**
 * K-apt 공동주택 단지 수집 스크립트 (docs/03 §1)
 *
 * 사용법:
 *   KAPT_API_KEY=<공공데이터포털 인증키> node scripts/collect-kapt.mjs [시도코드...]
 *   (web/.env.local 에 KAPT_API_KEY가 있으면 자동으로 읽는다)
 *
 * 공공데이터포털 "공동주택 단지 목록제공 서비스 V4"(AptListService4)의
 * 시도 단위 목록(getSidoAptList4)과 "공동주택 기본 정보 V5"
 * (AptBasisInfoServiceV5/getAphusBassInfoV5)를 호출해
 * data/apartments.collected.json 을 생성한다.
 * 검토 후 data/apartments.json 으로 승격하는 2단계 구조 — 수집 결과를
 * 무검토로 출제 풀에 넣지 않는다 (docs/03 §4-2).
 *
 * 인증키 주의: 포털이 발급하는 키는 이미 URL 인코딩된 형태(%2B, %3D)라서
 * 다시 인코딩하면 인증 실패한다. '%'가 포함된 키는 그대로 쓴다.
 *
 * 쿼터: 기본정보 V5는 일일 5000건. LIMIT(기본 800)으로 상세 호출 수를
 * 제한해 하루 쿼터를 태우지 않는다. 이어서 수집하면 기존 수집본에 병합된다.
 *
 * 정제 규칙 (docs/03 §1-2):
 *  - 단지명 정규화(공백·괄호 병기 제거), 차수 중복은 대표 1건
 *  - 세대수·준공년도 결측 단지는 제외 (정답 공개 화면을 채울 수 없음)
 *  - 난이도 초기 라벨은 규칙 기반(토큰 수·펫네임 수), 이후 실측으로 갱신
 */

import fs from "node:fs";
import path from "node:path";

// .env.local 간이 로더 (의존성 0 유지)
const ENV_FILE = path.join(process.cwd(), ".env.local");
if (!process.env.KAPT_API_KEY && fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^KAPT_API_KEY=(.+)$/);
    if (m) process.env.KAPT_API_KEY = m[1].trim();
  }
}

const RAW_KEY = process.env.KAPT_API_KEY;
const BASE_LIST = "https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4";
const BASE_INFO = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5";
const OUT = path.join(process.cwd(), "data", "apartments.collected.json");
const LIMIT = Number(process.env.LIMIT ?? 800); // 기본정보 호출 상한 (일일 쿼터 보호)

// 인자 없으면 서울(11)만. 시도코드: 행정표준코드 앞 2자리
const SIDO_CODES = process.argv.slice(2).length ? process.argv.slice(2) : ["11"];

const PET_NAMES = ["포레", "에듀", "노블", "퍼스티지", "센트럴", "리버", "레이크", "파크", "어반", "블리스", "그랑", "스카이", "뷰", "시티", "베뉴", "포레스트", "클래스"];

if (!RAW_KEY) {
  console.error(
    [
      "KAPT_API_KEY가 없습니다.",
      "1) https://www.data.go.kr 에서 '공동주택 단지 목록제공 서비스'(V4)와",
      "   '공동주택 기본 정보제공 서비스'(V5) 활용 신청",
      "2) web/.env.local 에 KAPT_API_KEY=<인증키> 저장 후 실행",
      "수집 결과는 data/apartments.collected.json 에 저장되며, 검토 후",
      "data/apartments.json 으로 승격합니다.",
    ].join("\n"),
  );
  process.exit(1);
}
// 포털 키는 대개 이미 URL 인코딩됨('%' 포함) — 그대로 사용. 아니면 인코딩.
const KEY = RAW_KEY.includes("%") ? RAW_KEY : encodeURIComponent(RAW_KEY);

function normalizeName(raw) {
  return raw
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 차수 표기 제거한 대표 키 ("래미안OO 1차" → "래미안OO").
 * 검증기(validate-pool)의 중복 판정과 같게 공백을 전부 제거해 비교한다 —
 * "청광플러스원아파트"와 "청광플러스원 아파트"는 같은 단지다. */
function familyKey(name) {
  return name.replace(/\s*\d+(차|단지)$/g, "").replace(/\s+/g, "").toLowerCase();
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
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    // 포털 에러는 XML(OpenAPI_ServiceResponse)로 온다 — 사유를 그대로 보여준다
    throw new Error(`API 오류 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function listSido(sidoCode) {
  const items = [];
  for (let page = 1; ; page++) {
    const url = `${BASE_LIST}?serviceKey=${KEY}&sidoCode=${sidoCode}&pageNo=${page}&numOfRows=1000&_type=json`;
    const json = await getJson(url);
    const body = json?.response?.body;
    const rows = body?.items?.item ?? body?.items ?? [];
    items.push(...(Array.isArray(rows) ? rows : [rows]));
    if (page * 1000 >= Number(body?.totalCount ?? 0)) break;
  }
  return items;
}

async function basisInfo(kaptCode) {
  const url = `${BASE_INFO}?serviceKey=${KEY}&kaptCode=${kaptCode}&_type=json`;
  const json = await getJson(url);
  return json?.response?.body?.item ?? null;
}

// 기존 수집본이 있으면 이어서 (kaptCode 기준 재호출 방지)
const seen = new Map(); // familyKey → item
const doneCodes = new Set();
if (fs.existsSync(OUT)) {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    for (const it of prev.items ?? []) {
      seen.set(familyKey(it.name), it);
      doneCodes.add(it.id.replace(/^k/, ""));
    }
    console.error(`기존 수집본 ${seen.size}건에서 이어서 수집`);
  } catch {
    /* 손상 시 새로 시작 */
  }
}

let scanned = 0;
let calls = 0;

for (const sido of SIDO_CODES) {
  const list = await listSido(sido);
  console.error(`시도 ${sido}: 목록 ${list.length}건`);
  for (const row of list) {
    if (calls >= LIMIT) break;
    scanned++;
    const name = normalizeName(String(row.kaptName ?? ""));
    // 20자 초과는 카드 UI가 깨지고 검증기 형식 규칙에도 걸린다 — 풀에서 제외
    if (!name || name.length > 20 || seen.has(familyKey(name)) || doneCodes.has(String(row.kaptCode))) continue;
    calls++;
    let info;
    try {
      info = await basisInfo(row.kaptCode);
    } catch (e) {
      console.error(`기본정보 실패 ${row.kaptCode}: ${e.message}`);
      continue;
    }
    if (!info) continue;
    const households = Math.round(Number(info.kaptdaCnt ?? 0));
    const useDate = String(info.kaptUsedate ?? ""); // YYYYMMDD
    const builtYear = Number(useDate.slice(0, 4));
    if (!households || !builtYear) continue; // 결측 제외
    // V5는 as1~as3 대신 kaptAddr("서울특별시 송파구 방이동 89 …")만 준다
    const addr = String(info.kaptAddr ?? "").split(/\s+/);
    seen.set(familyKey(name), {
      id: `k${row.kaptCode}`,
      name,
      sido: String(row.as1 ?? addr[0] ?? ""),
      sigungu: String(row.as2 ?? addr[1] ?? ""),
      dong: String(row.as3 ?? addr[2] ?? ""),
      builtYear,
      households,
      difficulty: difficultyOf(name),
    });
    if (seen.size % 100 === 0) console.error(`정제 통과 ${seen.size}건 (스캔 ${scanned}, 호출 ${calls})`);
  }
  if (calls >= LIMIT) {
    console.error(`호출 상한 ${LIMIT}건 도달 — 내일 이어서 실행하면 이어붙는다`);
    break;
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
console.error(`완료: ${items.length}건 → ${OUT} (기본정보 호출 ${calls}건)`);
console.error("다음: node scripts/validate-pool.mjs 로 대조 검증 후 apartments.json 교체");
