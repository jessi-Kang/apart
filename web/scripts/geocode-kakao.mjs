#!/usr/bin/env node
/**
 * 실단지 좌표 채우기 — 정답 공개 칸의 항공사진(components/AptPhoto.tsx)에 쓴다.
 *
 * K-apt 기본정보에는 좌표가 없다. 브이월드 주소 변환은 해외 서버(GitHub Actions)에서
 * 막혀 있어 카카오 로컬 키워드 검색으로 "시군구 동 단지명"을 찾고, 찾은 곳의 주소가
 * 그 동을 품고 있을 때만 받는다(이름만 같은 다른 동네 단지를 잡지 않게).
 *
 *   KAKAO_REST_KEY=... node scripts/geocode-kakao.mjs [--max=3000]
 *
 * - 한 번에 --max건까지만 묻는다(무료 한도는 하루 10만 건이라 넉넉하지만, 야간 작업
 *   시간을 길게 잡아먹지 않게). 처음 1만 5천여 건은 며칠에 나눠 채워진다.
 * - 못 찾은 단지는 null로 적어 다시 묻지 않는다(매일 같은 실패를 되풀이하지 않게).
 * - 키가 없으면 아무것도 하지 않고 끝난다(실패가 아니다).
 * - node 기본 모듈만 쓴다(야간 작업은 의존성을 설치하지 않는다).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APTS = path.join(ROOT, "data/apartments.json");
const OUT = path.join(ROOT, "data/coords.json");
const KEY = process.env.KAKAO_REST_KEY ?? "";
const MAX = Number(/--max=(\d+)/.exec(process.argv.join(" "))?.[1] ?? 3000);

if (!KEY) {
  console.log("KAKAO_REST_KEY가 없어 좌표 채우기를 건너뜁니다.");
  process.exit(0);
}

const items = JSON.parse(fs.readFileSync(APTS, "utf8")).items;
const coords = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = items.filter((a) => !(a.id in coords)).slice(0, MAX);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function find(a) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", `${a.sigungu} ${a.dong} ${a.name}`);
  url.searchParams.set("size", "5");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`kakao ${res.status}`);
    const docs = (await res.json()).documents ?? [];
    // 그 동 안에 있는 곳만. 아파트 분류를 먼저 본다
    const inDong = docs.filter((d) => `${d.address_name} ${d.road_address_name}`.includes(a.dong));
    const pick = inDong.find((d) => /아파트|주거/.test(d.category_name ?? "")) ?? inDong[0];
    return pick ? [Number(Number(pick.y).toFixed(6)), Number(Number(pick.x).toFixed(6))] : null;
  }
  throw new Error("kakao retry exhausted");
}

let hit = 0, miss = 0;
for (const a of todo) {
  try {
    const g = await find(a);
    coords[a.id] = g;
    g ? hit++ : miss++;
  } catch (e) {
    // 키·한도 문제면 더 물어도 같은 결과다. 받은 데까지 저장하고 멈춘다
    console.error(`멈춤: ${e.message} (${a.name})`);
    break;
  }
  if ((hit + miss) % 200 === 0) fs.writeFileSync(OUT, JSON.stringify(coords));
  await sleep(60);
}
fs.writeFileSync(OUT, JSON.stringify(coords));
const total = Object.values(coords).filter(Boolean).length;
console.log(`좌표 채우기: 이번 ${hit}건 찾음 · ${miss}건 못 찾음 · 누적 ${total}/${items.length}`);
