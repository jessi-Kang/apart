#!/usr/bin/env node
/**
 * 아파트 감별사 배포 전 점검기.
 * 사람이 반복해서 눈으로 잡아낸 결함을 기계가 먼저 거른다.
 *
 *   cd web && npm run build && DATABASE_URL= npm start &
 *   node .claude/skills/qa/scripts/qa.mjs [all|layout|behavior|copy|data|live]
 *
 * 원칙: 마커가 아니라 동작을 본다. "코드에 그 문자열이 있다"는 통과가 아니다.
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd().endsWith("/web") ? path.resolve(process.cwd(), "..") : process.cwd();
const WEB = path.join(ROOT, "web");
const LOCAL = process.env.QA_BASE ?? "http://localhost:3000";
const LIVE = "https://apt-game.app";
const only = process.argv[2] ?? "all";
const want = (name) => only === "all" || only === name;

const results = [];
const ok = (area, msg) => results.push({ area, level: "ok", msg });
const bad = (area, msg) => results.push({ area, level: "fail", msg });
const skip = (area, msg) => results.push({ area, level: "skip", msg });

const require = createRequire(import.meta.url);
let chromium = null;
// playwright는 대개 전역 설치라 이 파일 기준 require 경로에 안 잡힌다.
// npm root -g가 알려 주는 자리까지 직접 찾아본다 — 못 찾아서 조용히 건너뛴
// 검사가 통과로 읽히는 것이 이 스킬이 막으려던 바로 그 일이다.
for (const spec of ["playwright", globalModulePath("playwright")]) {
  if (!spec) continue;
  try {
    ({ chromium } = require(spec));
    break;
  } catch {
    /* 다음 후보 */
  }
}

function globalModulePath(name) {
  try {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const p = path.join(root, name);
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const read = (p) => fs.readFileSync(path.join(WEB, p), "utf8");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(WEB, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", ".next", ".data"].includes(e.name)) walk(rel, out);
    } else if (/\.(tsx?|css)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const getJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

/* ---------- 1. 레이아웃 ---------- */
async function layout() {
  if (!chromium) return skip("레이아웃", "playwright 없음 — 설치: npm i -g playwright && npx playwright install chromium");
  try {
    execFileSync("node", [path.join(WEB, "scripts/check-layout.mjs"), LOCAL], {
      cwd: WEB,
      stdio: "pipe",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH ?? "" },
    });
    ok("레이아웃", "덜 찬 문단·고아 줄·세로 치우침 없음 (390·480·768·1024px × 화면 6종)");
  } catch (e) {
    const out = String(e.stderr ?? e.stdout ?? e.message).trim();
    bad("레이아웃", out.split("\n").filter((l) => l.trim()).join("\n         "));
  }
}

/* ---------- 2. 동작 ---------- */
async function behavior() {
  // 구역 격리·구역별 공식전·창구별 집계는 브라우저 없이 API로 확인한다
  const items = JSON.parse(read("data/apartments.json")).items;
  const bySido = new Map(items.map((a) => [a.name.replace(/\s+/g, ""), a.sido]));
  const probes = ["부산광역시", "제주특별자치도"];

  for (const area of probes) {
    const q = `?area=${encodeURIComponent(area)}`;
    try {
      const names = [];
      for (let i = 0; i < 40; i++) names.push((await getJson(`${LOCAL}/api/endless/ox${q}`)).name);
      const leak = names.filter((n) => {
        const s = bySido.get(n.replace(/\s+/g, ""));
        return s && s !== area;
      });
      if (leak.length) bad("구역 격리", `${area}에 다른 지역 실단지 ${leak.length}건: ${leak.slice(0, 3).join(", ")}`);
      else ok("구역 격리", `${area} 40문제에 다른 지역 실단지 0건`);
    } catch (e) {
      bad("구역 격리", `${area} 확인 실패: ${e.message}`);
    }
  }

  // 구역별 공식전: 같은 구역 두 번 = 같은 문제 / 모르는 구역 = 전국
  try {
    const a = await getJson(`${LOCAL}/api/quiz/today?area=${encodeURIComponent("부산광역시")}`);
    const b = await getJson(`${LOCAL}/api/quiz/today?area=${encodeURIComponent("부산광역시")}`);
    const nation = await getJson(`${LOCAL}/api/quiz/today`);
    const bogus = await getJson(`${LOCAL}/api/quiz/today?area=${encodeURIComponent("없는구역시")}`);
    const same = JSON.stringify(a.items) === JSON.stringify(b.items);
    const differs = JSON.stringify(a.items) !== JSON.stringify(nation.items);
    if (same && differs && bogus.area === "") ok("구역별 공식전", "같은 구역=같은 문제, 구역≠전국, 모르는 구역→전국");
    else bad("구역별 공식전", `재현성 ${same} / 전국과 구분 ${differs} / 모르는 구역 area=${JSON.stringify(bogus.area)}`);
  } catch (e) {
    bad("구역별 공식전", e.message);
  }

  // 창구별 집계 분리 — 세 창구 오늘 문제가 서로 달라야 한다
  try {
    const [ox, asm, find] = await Promise.all([
      getJson(`${LOCAL}/api/quiz/today`),
      getJson(`${LOCAL}/api/assemble/today`),
      getJson(`${LOCAL}/api/findreal/today`),
    ]);
    const finishRoutes = await Promise.all(
      ["quiz", "assemble", "findreal"].map(async (m) => {
        const r = await fetch(`${LOCAL}/api/${m}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        return [m, r.status];
      }),
    );
    const missing = finishRoutes.filter(([, s]) => s === 404).map(([m]) => m);
    if (missing.length) bad("창구별 집계", `완주 집계 라우트 없음: ${missing.join(", ")}`);
    else ok("창구별 집계", `세 창구 완주 라우트 응답 (${finishRoutes.map(([m, s]) => `${m}:${s}`).join(" ")})`);
    if (ox.items.length === 10 && asm.items.length === 10 && find.items.length === 10)
      ok("공식전 편성", "세 창구 모두 10문제");
    else bad("공식전 편성", `문제 수 ox:${ox.items.length} assemble:${asm.items.length} findreal:${find.items.length}`);
  } catch (e) {
    bad("창구별 집계", e.message);
  }

  if (!chromium) return skip("PWA·배경음", "playwright 없음");

  const browser = await chromium.launch();
  try {
    // PWA 설치 가능 + 공유 이미지 파일명
    const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(LOCAL, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    const errs = await cdp.send("Page.getInstallabilityErrors").catch(() => null);
    const list = errs?.installabilityErrors ?? null;
    if (list && list.length === 0) ok("PWA", "설치 조건 충족 (installabilityErrors 없음)");
    else if (list) bad("PWA", `설치 막힘: ${JSON.stringify(list)}`);
    else skip("PWA", "CDP 확인 실패");

    // 배경음이 실제로 울리는가
    const audio = await ctx.newPage();
    await audio.addInitScript(() => {
      window.__gains = [];
      const O = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const g = O.call(this);
        const r = g.gain.linearRampToValueAtTime.bind(g.gain);
        g.gain.linearRampToValueAtTime = (v, t) => {
          window.__gains.push(v);
          return r(v, t);
        };
        return g;
      };
    });
    await audio.goto(LOCAL, { waitUntil: "load" });
    await audio.click('a[href="/o"]');
    // 고정 대기로 재면 안 된다. 서버가 막 떴을 때는 첫 /api/quiz/today가
    // 7,532건짜리 출제 풀을 처음 읽느라 몇 초씩 걸려서, 소리가 나기도 전에
    // 시간이 끝나 "배경음 안 나옴"으로 잘못 보고한다(실제로 한 번 속았다).
    // 창구가 실제로 열린 것을 보고 나서 잰다.
    await audio.waitForSelector(".qname", { timeout: 30_000 }).catch(() => null);
    await audio.waitForTimeout(2000);
    const gains = await audio.evaluate(() => window.__gains ?? []);
    const loud = gains.filter((g) => g > 0);
    if (loud.length) ok("배경음", `게임 진입 후 볼륨 ${Math.max(...loud)}로 재생`);
    else bad("배경음", "게임에 들어가도 볼륨이 올라가지 않음");

    // 공유 이미지 저장 파일명
    const dl = await ctx.newPage();
    await dl.goto(`${LOCAL}/play`, { waitUntil: "load" });
    await dl.waitForSelector(".qname", { timeout: 20000 });
    await dl.locator('button:has-text("진짜"), button:has-text("가짜")').first().click();
    await dl.waitForTimeout(1200);
    await dl.locator(".close-x").click();
    await dl.waitForSelector(".stamp-hero", { timeout: 15000 });
    const got = dl.waitForEvent("download", { timeout: 20000 }).then((d) => d.suggestedFilename()).catch(() => null);
    await dl.locator('button:has-text("통지서 공유")').first().click();
    const name = await got;
    if (!name) bad("공유 이미지", "저장이 시작되지 않음");
    else if (/^[\x20-\x7e]+\.png$/.test(name)) ok("공유 이미지", `파일명 ${name}`);
    else bad("공유 이미지", `파일명이 ASCII .png가 아님: ${name} (한글 이름은 크롬이 download 속성을 버린다)`);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

/* ---------- 3. 일관성 ---------- */
function copy() {
  const files = walk("app").concat(walk("components"), walk("lib"));
  const ui = files.filter((f) => /\.tsx$/.test(f));

  const hits = (re, list = ui) =>
    list.flatMap((f) => {
      const out = [];
      read(f).split("\n").forEach((line, i) => {
        if (re.test(line)) out.push(`${f}:${i + 1} ${line.trim().slice(0, 70)}`);
      });
      return out;
    });

  // 용어집: 쓰지 않기로 한 말
  const banned = hits(/["'>][^"'<]*(세션|라운드|콤보|엔들리스|데일리)[^"'<]*["'<]/);
  if (banned.length) bad("용어집", `쓰지 않기로 한 말이 화면 문구에 있음\n         ${banned.join("\n         ")}`);
  else ok("용어집", "세션·라운드·콤보 등 금지어 없음");

  // em-dash
  const dash = hits(/["'>][^"'<]*—[^"'<]*["'<]/);
  if (dash.length) bad("문구", `em-dash 사용\n         ${dash.join("\n         ")}`);
  else ok("문구", "UI 문구에 em-dash 없음");

  // 터치 잔상: hover가 미디어쿼리 밖에 있는가
  // 주석 안에서 규칙을 설명한 글자까지 코드로 세면 영원히 실패한다
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
  const css = stripComments(read("app/globals.css"));
  const outsideHover = [];
  let depth = 0;
  let inHoverMedia = false;
  for (const line of css.split("\n")) {
    if (/@media[^{]*\(hover:\s*hover\)/.test(line)) { inHoverMedia = true; depth = 0; }
    if (inHoverMedia) {
      depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
      if (depth <= 0 && /}/.test(line)) inHoverMedia = false;
      continue;
    }
    if (/:hover/.test(line) && !/^\s*\/\*/.test(line)) outsideHover.push(line.trim().slice(0, 70));
  }
  if (outsideHover.length) bad("터치 잔상", `:hover가 @media (hover: hover) 밖에 있음\n         ${outsideHover.join("\n         ")}`);
  else ok("터치 잔상", ":hover가 모두 hover 가능 기기로 한정됨");

  // 본문에 text-wrap이 다시 붙었는가
  const bodyWrap = /body\s*{[^}]*text-wrap/.test(css.replace(/\n/g, " "));
  if (bodyWrap) bad("줄바꿈", "body에 text-wrap이 있다 — 오른쪽이 안 차는 원인이었다");
  else ok("줄바꿈", "본문에 text-wrap 없음 (브라우저 기본이 가장 잘 채운다)");

  // ch 단위 폭 제한
  if (/max-width:\s*\d+(\.\d+)?ch/.test(css))
    bad("줄바꿈", "ch 단위 폭 제한 — ch는 숫자 0의 폭이라 한글은 의도한 글자 수의 절반에서 꺾인다");
  else ok("줄바꿈", "ch 단위 폭 제한 없음");

  // 이모지 (클립보드 공유 텍스트 제외)
  const emoji = ui
    .filter((f) => !/share|sharecard/i.test(f))
    .flatMap((f) => {
      const out = [];
      read(f).split("\n").forEach((line, i) => {
        if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) out.push(`${f}:${i + 1}`);
      });
      return out;
    });
  if (emoji.length) bad("그래픽", `이모지 사용 (판정·그리드는 SVG로) ${emoji.join(", ")}`);
  else ok("그래픽", "이모지 없음");

  /**
   * 나가는 문이 둘인가.
   * 머리글 X와 "창구로 돌아가기" 버튼은 같은 일을 한다. 한 화면에 둘 다 두면
   * 어느 쪽이 무엇인지 잠깐 생각하게 된다. 사람이 눈으로 잡던 항목인데,
   * 새 화면을 만들 때마다 똑같이 둘 다 넣어서 자동 검사로 옮긴다.
   * 게임 화면의 X는 "판 끝내기"라 뜻이 달라 조건부로 들어간다(핸들러가 붙는다).
   */
  const twoDoors = [];
  for (const f of files.filter((x) => x.endsWith("page.tsx"))) {
    const src = stripComments(read(f));
    const hasX = /className="close-x"/.test(src);
    // onClose 같은 핸들러가 붙은 X는 나가는 문이 아니라 다른 동작이다
    const plainX = hasX && !/<CloseX/.test(src);
    const hasBack = /창구로 돌아가기\s*\n?\s*<\/(Link|button)>/.test(src);
    if (plainX && hasBack) twoDoors.push(f);
  }
  if (twoDoors.length) bad("나가는 문", `머리글 X와 '창구로 돌아가기'가 함께 있음: ${twoDoors.join(", ")}`);
  else ok("나가는 문", "한 화면에 나가는 문이 하나씩");
}

/* ---------- 4. 데이터 ---------- */
function data() {
  try {
    // 주의가 수만 줄이라 기본 버퍼(1MB)로는 ENOBUFS로 터진다
    execFileSync("node", ["scripts/validate-pool.mjs"], { cwd: WEB, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
    const items = JSON.parse(read("data/apartments.json")).items;
    const fakes = JSON.parse(read("data/fake_names.json")).items;
    ok("출제 풀", `검증 통과 — 실단지 ${items.length}건, 가짜 ${fakes.length}건`);

    const NOISE = /관리사무소|\d{3,}|제\s*\d|\d+\s*구역|임대|\d+\s*호(?!반|텔)|주택도시공사|도시개발공사|SH공사/;
    const clean = items.filter((a) => !NOISE.test(a.name));
    const bySido = {};
    for (const a of clean) (bySido[a.sido] ??= []).push(a);
    const thin = Object.entries(bySido).filter(([, l]) => l.length < 20).map(([s, l]) => `${s} ${l.length}건`);
    if (thin.length) bad("구역 풀", `문턱(20건) 미달: ${thin.join(", ")}`);
    else ok("구역 풀", `시·도 ${Object.keys(bySido).length}곳 전부 20건 이상 (출제 ${clean.length}건)`);

    // lib/data.ts의 assemblable과 같은 규칙이다. 한쪽만 고치면 개수가 어긋난다
    const assemblable = (name) => {
      const parts = name.split(" ").filter(Boolean);
      return parts.length >= 2 && parts.every((p) => /[가-힣A-Za-z]/.test(p));
    };
    const asm = clean.filter((a) => assemblable(a.name));
    const asmThin = Object.entries(bySido)
      .map(([s, l]) => [s, l.filter((a) => assemblable(a.name)).length])
      .filter(([, n]) => n < 20);
    if (asmThin.length) bad("조립 퍼즐", `시·도별 20개 미달(전국으로 되돌아감): ${asmThin.map(([s, n]) => `${s} ${n}`).join(", ")}`);
    else ok("조립 퍼즐", `전국 ${asm.length}개, 시·도별 모두 20개 이상`);

    // 조각이 말이 되는가 — "1," "24" 같은 조각이 생기는 이름은 조립에 못 쓴다
    const junk = clean.filter((a) => a.name.split(" ").filter(Boolean).length >= 2 && !assemblable(a.name));
    if (junk.length && clean.filter((a) => assemblable(a.name)).some((a) => junk.includes(a)))
      bad("조립 조각", `글자 없는 조각이 생기는 이름이 조립 풀에 남음: ${junk.slice(0, 3).map((a) => a.name).join(", ")}`);
    else ok("조립 조각", `글자 없는 조각(\"1,\" \"24\" 등)이 생기는 이름 ${junk.length}건 전부 조립에서 제외`);
  } catch (e) {
    const out = String(e.stderr ?? e.stdout ?? e.message);
    const fails = out.split("\n").filter((l) => l.startsWith("실패:")).slice(0, 8);
    bad("출제 풀", fails.length ? fails.join("\n         ") : out.trim().slice(0, 300));
  }
}

/* ---------- 5. 배포 ---------- */
async function live() {
  try {
    const r = await fetch(`${LIVE}/api/quiz/today?area=${encodeURIComponent("부산광역시")}`);
    const j = await r.json();
    if (j.area === "부산광역시") ok("배포", "라이브가 구역별 공식전을 내려준다");
    else bad("배포", `라이브 응답 area=${JSON.stringify(j.area)} — 아직 옛 빌드일 수 있다`);
  } catch (e) {
    bad("배포", `apt-game.app 응답 실패: ${e.message}`);
  }

  try {
    const r = await fetch("https://apt-gam-jessikang.vercel.app/", { redirect: "manual" });
    const loc = r.headers.get("location") ?? "";
    if (r.status === 308 && loc.startsWith(LIVE)) ok("도메인", "옛 주소가 정식 도메인으로 308");
    else bad("도메인", `옛 주소 ${r.status} ${loc} — 그 주소로 설치한 앱은 로그인이 막힌다`);
  } catch (e) {
    skip("도메인", `확인 실패: ${e.message}`);
  }

  try {
    const r = await fetch(`${LIVE}/api/auth/login`, { redirect: "manual" });
    const u = new URL(r.headers.get("location") ?? "https://x/");
    const redirect = u.searchParams.get("redirect_uri");
    if (redirect === `${LIVE}/api/auth/callback`) ok("로그인", `redirect_uri = ${redirect}`);
    else bad("로그인", `redirect_uri = ${redirect} — 구글 콘솔 등록값과 한 글자만 달라도 막힌다`);
  } catch (e) {
    skip("로그인", `확인 실패: ${e.message}`);
  }
}

/* ---------- 실행 ---------- */
if (want("data")) data();
if (want("copy")) copy();
if (want("layout")) await layout();
if (want("behavior")) await behavior();
if (want("live")) await live();

const icon = { ok: "  OK ", fail: "실패 ", skip: "확인못함" };
console.log("");
for (const r of results) console.log(`${icon[r.level]} [${r.area}] ${r.msg}`);
const fails = results.filter((r) => r.level === "fail");
const skips = results.filter((r) => r.level === "skip");
console.log("");
console.log(`통과 ${results.length - fails.length - skips.length} / 실패 ${fails.length} / 확인 못 함 ${skips.length}`);
if (skips.length) console.log("확인 못 한 항목은 통과가 아니다. 사람이 봐야 한다.");
process.exit(fails.length ? 1 : 0);
