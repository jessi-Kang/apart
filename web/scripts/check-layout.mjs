#!/usr/bin/env node
/**
 * 화면 레이아웃 회귀 검사 (문구를 추가할 때마다 사람이 눈으로 잡지 않도록)
 *
 *   npm run build && npm start   (다른 터미널)
 *   node scripts/check-layout.mjs [http://localhost:3000]
 *
 * 잡는 것:
 *  1. 고아 줄 — 여러 줄로 꺾였는데 마지막 줄이 가장 긴 줄의 34%도 안 되는 문단.
 *     "…랭킹전에 / 출전합니다." 처럼 끝이 뚝 잘린 모양이 오른쪽이 비어 보이는 정체다.
 *  2. 세로 치우침 — 상자 안에서 글자가 위아래 어느 한쪽으로 6px 넘게 쏠린 곳.
 *     격자에서 늘어난 버튼의 글자가 위에 붙는 종류의 결함.
 *
 * 왜 스크립트인가: 같은 결함을 화면마다 하나씩 찾아 고치는 방식으로는
 * 문구를 새로 넣을 때마다 되살아난다. 기본값(globals.css의 text-wrap: pretty)으로
 * 막고, 그래도 새는 것을 이 검사로 잡는다.
 *
 * 의존성을 새로 넣지 않으려고 전역 설치된 playwright를 빌려 쓴다.
 * 없으면 검사를 건너뛰고 설치 방법만 알린다(실패로 처리하지 않는다).
 */

import { createRequire } from "node:module";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTHS = [390, 480];

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("playwright를 찾지 못해 레이아웃 검사를 건너뜁니다.");
  console.error("  npm i -g playwright && npx playwright install chromium");
  process.exit(0);
}

/** 화면 하나를 열고 손봐야 할 상태까지 몰고 가는 방법 */
const SCREENS = [
  { name: "홈", path: "/" },
  { name: "기록 열람실", path: "/record", wait: 1200 },
  { name: "이름 조립", path: "/assemble", ready: ".tile" },
  { name: "진짜 찾기", path: "/findreal", wait: 2500 },
  { name: "감별 O/X", path: "/play", ready: ".qname" },
  {
    name: "결과 통지서",
    path: "/play",
    ready: ".qname",
    async after(page) {
      await page.locator('button:has-text("진짜"), button:has-text("가짜")').first().click();
      await page.waitForTimeout(1200);
      await page.locator(".close-x").click();
      await page.waitForSelector(".stamp-hero", { timeout: 10_000 });
      await page.waitForTimeout(600);
    },
  },
];

const findOrphans = () => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walk.nextNode())) {
    const text = n.textContent.trim();
    if (text.length < 8) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const rows = [];
    for (const r of rects) {
      const row = rows.find((q) => Math.abs(q.top - r.top) < 3);
      if (row) row.w += r.width;
      else rows.push({ top: r.top, w: r.width });
    }
    if (rows.length < 2) continue;
    const last = rows[rows.length - 1].w;
    const widest = Math.max(...rows.map((r) => r.w));
    if (last / widest < 0.34) {
      out.push({
        kind: "고아 줄",
        where: el.className || el.tagName,
        detail: `${rows.length}줄, 마지막 줄이 ${Math.round((last / widest) * 100)}%`,
        text: el.innerText.slice(0, 48).replace(/\n/g, " "),
      });
    }
  }
  return out;
};

const findMisaligned = () => {
  const out = [];
  for (const el of document.querySelectorAll("a,button,.btn,.chop,.tile,.slot,.st")) {
    const box = el.getBoundingClientRect();
    if (box.height < 12 || box.width < 12) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    if (!t.height) continue;
    const top = t.top - box.top;
    const bottom = box.bottom - t.bottom;
    if (Math.abs(top - bottom) > 6 && box.height - t.height > 8) {
      out.push({
        kind: "세로 치우침",
        where: el.className || el.tagName,
        detail: `위 ${Math.round(top)}px / 아래 ${Math.round(bottom)}px`,
        text: el.innerText.slice(0, 24).replace(/\n/g, " "),
      });
    }
  }
  return out;
};

const browser = await chromium.launch();
let failures = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  for (const screen of SCREENS) {
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + screen.path, { waitUntil: "load", timeout: 30_000 });
      if (screen.ready) await page.waitForSelector(screen.ready, { timeout: 20_000 });
      if (screen.wait) await page.waitForTimeout(screen.wait);
      if (screen.after) await screen.after(page);
      const found = [...(await page.evaluate(findOrphans)), ...(await page.evaluate(findMisaligned))];
      if (found.length) {
        failures += found.length;
        console.error(`\n[${width}px] ${screen.name}`);
        for (const f of found) console.error(`  ${f.kind} [${f.where}] ${f.detail} :: ${f.text}`);
      }
    } catch (e) {
      console.error(`\n[${width}px] ${screen.name} — 열지 못했습니다: ${e.message}`);
      failures++;
    } finally {
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();

if (failures) {
  console.error(`\n레이아웃 검사 실패 ${failures}건.`);
  console.error("고아 줄은 그 문단에 text-wrap: balance를, 세로 치우침은 상자에 가운데 정렬을 준다.");
  process.exit(1);
}
console.error(`레이아웃 검사 통과 (${WIDTHS.join("px, ")}px × 화면 ${SCREENS.length}종)`);
