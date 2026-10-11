#!/usr/bin/env node
/**
 * 주간 점검: 진짜·가짜 비율 (.github/workflows/weekly-balance.yml)
 *
 *   npm run weekly-balance            # DATABASE_URL이 있으면 실제 출제분까지
 *
 * 세 창구 모두 "읽지 않고는 못 맞히는" 게임이어야 한다. 감별은 모르면 반, 진짜 찾기는
 * 모르면 넷에 하나, 이름 조립은 미끼가 정답 조각과 구별이 안 돼야 한다. 처음에는 감별만
 * 쟀는데 나머지 둘도 같은 풀에서 뽑으니 같은 데서 샌다. 어긋날 수 있는 자리:
 *   1) 실제로 나간 문제 — 규칙이 반반이어도 구역·판 길이에 따라 쏠릴 수 있다
 *   2) 구역별 풀 — 가짜는 이름에 든 지역 말투로 구역이 갈려서(lib/data.ts) 어떤 구역은
 *      가짜가 얇아 같은 가짜가 되풀이된다. 되풀이되는 가짜는 외워서 맞힌다
 *   3) 겉모양 — 비율이 반반이어도 띄어쓰기·글자 수만 보고 찍을 수 있으면 반반이 아니다
 *      (세 주를 쏠린 채 돈 적이 있다, CLAUDE.md)
 *
 * 출제 규칙은 실제 코드(lib/run.ts의 oxAt)를 그대로 돌린다 — 스크립트에 옮겨 적으면
 * 둘이 갈라진다. 결과는 마크다운으로 내고 /tmp/balance.md에도 남긴다(일지 이슈 댓글용).
 *
 * 실제로 나간 문제는 name_stats(누적)를 지난 점검 때 적어 둔 합계와 빼서 이번 주
 * 몫만 본다(balance_snapshot). 누적만 보면 첫 주의 쏠림이 몇 달 뒤에도 평균에 남는다.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { assembleAt, findAt, oxAt } from "../lib/run.ts";
import { apartments, poolOf, regions, areaLabel } from "../lib/data.ts";
import { SHAPE_FEATURES } from "../lib/balance.ts";
import { assembleForDate, checkAssemble } from "../lib/assemble.ts";

const RUNS = 300; // 모의로 칠 판 수
const LEN = 20; // 한 판에 몇 문제까지 보나 (무한 판 대부분이 이 안에서 끝난다)
const lines: string[] = [];
const warns: string[] = [];
const out = (s = "") => lines.push(s);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/* ---------- 1. 실제로 나간 문제 ---------- */
async function served() {
  out("### 1. 실제로 나간 문제");
  const url = process.env.DATABASE_URL;
  if (!url) {
    out("DATABASE_URL이 없어 건너뜀 — 출제 규칙·풀만 봤습니다.");
    return;
  }
  const sql = neon(url);
  await modeAccuracy(sql);
  out("");
  out("**감별 O/X 이름별 집계 (지난 점검 이후)**");
  out("");
  await sql`
    CREATE TABLE IF NOT EXISTS balance_snapshot (
      at          timestamptz PRIMARY KEY DEFAULT now(),
      real_shown  bigint NOT NULL,
      real_fooled bigint NOT NULL,
      fake_shown  bigint NOT NULL,
      fake_fooled bigint NOT NULL
    )`;
  const rows = (await sql`
    SELECT kind, SUM(shown)::bigint AS shown, SUM(fooled)::bigint AS fooled
    FROM name_stats GROUP BY kind`) as { kind: string; shown: string; fooled: string }[];
  const now = { real_shown: 0, real_fooled: 0, fake_shown: 0, fake_fooled: 0 };
  for (const r of rows) {
    if (r.kind === "real") (now.real_shown = Number(r.shown)), (now.real_fooled = Number(r.fooled));
    if (r.kind === "fake") (now.fake_shown = Number(r.shown)), (now.fake_fooled = Number(r.fooled));
  }
  const prev = ((await sql`SELECT * FROM balance_snapshot ORDER BY at DESC LIMIT 1`) as Record<string, string>[])[0];
  await sql`
    INSERT INTO balance_snapshot (real_shown, real_fooled, fake_shown, fake_fooled)
    VALUES (${now.real_shown}, ${now.real_fooled}, ${now.fake_shown}, ${now.fake_fooled})`;
  const d = (k: keyof typeof now) => now[k] - Number(prev?.[k] ?? 0);
  const rs = d("real_shown"), fs_ = d("fake_shown");
  const since = prev ? `${new Date(prev.at).toISOString().slice(0, 10)} 이후` : "처음 재는 것이라 누적 전체";
  if (rs + fs_ === 0) {
    out(`${since} 나간 문제가 없습니다.`);
    return;
  }
  const realShare = rs / (rs + fs_);
  const realFooled = rs ? d("real_fooled") / rs : 0;
  const fakeFooled = fs_ ? d("fake_fooled") / fs_ : 0;
  out(`${since} · ${(rs + fs_).toLocaleString()}문제`);
  out("");
  out("| | 나간 수 | 비율 | 속은 비율 |");
  out("|---|---:|---:|---:|");
  out(`| 진짜 | ${rs.toLocaleString()} | ${pct(realShare)} | ${pct(realFooled)} (가짜라고 함) |`);
  out(`| 가짜 | ${fs_.toLocaleString()} | ${pct(1 - realShare)} | ${pct(fakeFooled)} (진짜라고 함) |`);
  // 표본이 적으면 반반에서 몇 %p 벗어나는 건 우연이다. 2천 문제가 넘었을 때만 본다
  if (rs + fs_ >= 2000 && Math.abs(realShare - 0.5) > 0.05)
    warns.push(`실제로 나간 진짜 비율이 ${pct(realShare)} — 반반에서 5%p 넘게 벗어났다`);
  // 한쪽만 잘 속이면 "모르면 그쪽으로 찍기"가 이긴다
  if (rs >= 300 && fs_ >= 300 && Math.abs(realFooled - fakeFooled) > 0.15)
    warns.push(`속은 비율이 진짜 ${pct(realFooled)} · 가짜 ${pct(fakeFooled)} — 한쪽이 15%p 넘게 쉽다`);
}

/**
 * 창구별 정답률 (최근 7일). 무한은 판 기록(endless_runs), 공식전은 문제별 집계(question_stats).
 * 찍기만 해도 나오는 값(감별 50% · 찾기 25%)보다 한참 높으면 문제가 읽기 전에 풀리고 있다는
 * 신호다. 무한 판 기록은 클라이언트가 올린 수라 참고로만 보고, 경고는 서버가 센 공식전만 낸다.
 */
const MODES: [string, string, number | null][] = [
  ["ox", "감별 O/X", 0.5],
  ["findreal", "진짜 찾기", 0.25],
  ["assemble", "이름 조립", null],
];
async function modeAccuracy(sql: ReturnType<typeof neon>) {
  const endless = (await sql`
    SELECT mode, SUM(hits)::bigint AS hit, SUM(cnt)::bigint AS n, COUNT(*)::int AS runs
    FROM endless_runs WHERE created_at > now() - interval '7 days' GROUP BY mode`) as { mode: string; hit: string; n: string; runs: number }[];
  const official = (await sql`
    SELECT mode, SUM(correct)::bigint AS hit, SUM(answered)::bigint AS n
    FROM question_stats WHERE date >= to_char(now() AT TIME ZONE 'Asia/Seoul' - interval '7 days', 'YYYY-MM-DD')
    GROUP BY mode`) as { mode: string; hit: string; n: string }[];
  out("**창구별 정답률 (최근 7일)**");
  out("");
  out("| 창구 | 찍기만 하면 | 무한 (판 기록) | 공식전 (서버 집계) |");
  out("|---|---:|---:|---:|");
  for (const [mode, label, chance] of MODES) {
    const e = endless.find((r) => r.mode === mode);
    const o = official.find((r) => r.mode === mode);
    const cell = (hit?: string, n?: string, extra = "") =>
      n && Number(n) > 0 ? `${pct(Number(hit) / Number(n))} (${Number(n).toLocaleString()}문제${extra})` : "없음";
    out(`| ${label} | ${chance === null ? "-" : pct(chance)} | ${cell(e?.hit, e?.n, e ? ` · ${e.runs}판` : "")} | ${cell(o?.hit, o?.n)} |`);
    // 서버가 센 공식전에서, 표본이 차고 찍기 값보다 40%p 넘게 높으면 문제가 너무 쉽게 풀린다
    if (chance !== null && o && Number(o.n) >= 500 && Number(o.hit) / Number(o.n) > chance + 0.4)
      warns.push(`${label} 공식전 정답률 ${pct(Number(o.hit) / Number(o.n))} — 찍기(${pct(chance)})보다 40%p 넘게 높다`);
  }
}

/* ---------- 2. 출제 규칙 모의 + 구역별 풀 ---------- */
/**
 * 진짜/가짜를 정하는 규칙은 구역과 무관하다(시드만 본다). 그래서 비율·연달아 나오는
 * 길이는 전국으로 한 번만 굴리고, 구역마다 다른 것(가짜가 얼마나 얇은가)은 계산으로 낸다.
 * 되풀이는 "가짜 100개를 볼 때 이미 본 가짜를 다시 만나는 몫"이다 — 고르게 뽑힌다고
 * 치면 100 − F·(1 − (1 − 1/F)^100). 판 열 개쯤 친 사람의 체감이다. 되풀이되는 가짜는
 * 읽지 않고 외워서 맞힌다.
 */
const SEEN = 100;
const repeatOf = (f: number) => (f ? (SEEN - f * (1 - Math.pow(1 - 1 / f, SEEN))) / SEEN : 1);

function rules() {
  let real = 0, total = 0, longest = 0;
  for (let r = 0; r < RUNS; r++) {
    const seed = (Math.imul(r + 1, 2654435761) ^ 0x5bd1e995) >>> 0;
    let streak = 0, last: boolean | null = null;
    for (let n = 0; n < LEN; n++) {
      const q = oxAt(seed, "", n);
      total++;
      if (q.real) real++;
      streak = q.real === last ? streak + 1 : 1;
      last = q.real;
      longest = Math.max(longest, streak);
    }
  }
  const share = real / total;
  out(`### 2. 출제 규칙 (lib/run.ts 그대로 ${RUNS}판 × ${LEN}문제)`);
  out("");
  out(`진짜 비율 ${pct(share)} · 같은 쪽이 가장 길게 연달아 나온 것 ${longest}문제`);
  if (Math.abs(share - 0.5) > 0.04) warns.push(`출제 규칙의 진짜 비율이 ${pct(share)}`);
  if (longest > 8) warns.push(`같은 쪽이 ${longest}문제 연달아 나온다 (규칙은 3연속부터 반대쪽으로 기운다)`);
  out("");
  // 겉모양 무게(lib/balance.ts) 때문에 실제로 도는 가짜는 풀보다 적다. 유효 크기 = (Σw)²/Σw²
  out(`| 구역 | 실단지 | 가짜 | 실제로 도는 가짜 | 가짜 되풀이 (${SEEN}개 볼 때) |`);
  out("|---|---:|---:|---:|---:|");
  for (const area of ["", ...regions.map((r) => r.sido)]) {
    const { reals, fakes, fakeW } = poolOf(area || null);
    const ws = [...fakeW.values()];
    const eff = Math.round(ws.reduce((a, b) => a + b, 0) ** 2 / (ws.reduce((a, b) => a + b * b, 0) || 1));
    const rep = repeatOf(eff);
    const label = area ? areaLabel(area) : "전국";
    out(`| ${label} | ${reals.length.toLocaleString()} | ${fakes.length.toLocaleString()} | ${eff.toLocaleString()} | ${pct(rep)} |`);
    if (rep > 0.15) warns.push(`${label}: 가짜가 얇다 (실제로 도는 것 ${eff}건 — ${SEEN}개 중 ${pct(rep)}가 본 것)`);
  }
}

/* ---------- 3. 겉모양 ---------- */
/**
 * 두 번 잰다. 풀 그대로(이름 수로 센 것)와 실제로 나가는 것(겉모양 무게를 먹인 것).
 * 경고는 나가는 쪽만 — 풀이 쏠려 있어도 무게가 덮고 있으면 플레이어는 못 찍는다.
 * 다만 풀의 쏠림이 커지면 무게가 한도(0.25~4)에 걸려 못 덮게 되므로 같이 적어 둔다.
 */
function looks() {
  out("### 3. 겉모양으로 찍을 수 있는가 (실제로 나가는 비율)");
  out("");
  const found: string[] = [];
  let rawTells = 0;
  for (const area of ["", ...regions.map((r) => r.sido)]) {
    const { reals, fakes, realW, fakeW } = poolOf(area || null);
    const rate = <T extends { name: string }>(arr: T[], f: (n: string) => boolean, w?: Map<T, number>) => {
      let on = 0, all = 0;
      for (const x of arr) {
        const k = w?.get(x) ?? 1;
        all += k;
        if (f(x.name)) on += k;
      }
      return on / (all || 1);
    };
    for (const [label, f] of SHAPE_FEATURES) {
      const tell = (rf: number, rr: number) => ((rf + rr) / 2 >= 0.05 ? rf / (rf + rr) : 0.5);
      // 그 특징이 드문 것이면(문제 스물에 하나 꼴도 안 되면) 힌트가 돼도 판을 못 흔든다
      const raw = tell(rate(fakes, f), rate(reals, f));
      if (raw > 0.65 || raw < 0.35) rawTells++;
      const rf = rate(fakes, f, fakeW), rr = rate(reals, f, realW);
      const g = tell(rf, rr);
      // "아파트"로 끝나면 진짜 쪽이 많은 것처럼 반대 방향도 힌트다 — 찍을 쪽만 다르다
      if (g > 0.65 || g < 0.35)
        found.push(`${area ? areaLabel(area) : "전국"} · ${label}: ${g > 0.5 ? "가짜" : "진짜"}로 찍으면 ${pct(Math.max(g, 1 - g))} 적중 (가짜 ${pct(rf)} 대 실단지 ${pct(rr)})`);
    }
  }
  if (found.length === 0) out("구역마다 띄어쓰기·글자 수·끝 낱말 어느 것으로도 65% 넘게 찍을 수 없습니다.");
  else {
    for (const f of found) out(`- ${f}`);
    warns.push(`겉모양 힌트 ${found.length}건 (3번 참고)`);
  }
  out("");
  out(`풀 자체(무게 없이 센 것)의 쏠림은 ${rawTells}건이고, 출제 무게(lib/balance.ts)가 덮고 있습니다.`);
}

/* ---------- 4. 진짜 찾기: 넷 중 겉모양으로 고르기 ---------- */
/**
 * 감별 O/X의 겉모양 검사는 이름 하나씩 본다. 진짜 찾기는 넷을 나란히 놓으니 "혼자만 다른
 * 하나"가 눈에 띈다 — 넷 중 하나만 "…아파트"로 끝나면 그게 진짜일 가능성이 높다는 식이다.
 * 그래서 실제 출제(findAt)를 돌려 수법마다 기대 적중률을 잰다: 특징이 있는(또는 없는) 보기만
 * 후보로 남기고 그중 하나를 고른다(없으면 넷 중 하나). 찍기 값은 25%, 35%를 넘으면 주의.
 */
const FIND_N = 200;
function findTells() {
  out(`### 4. 진짜 찾기: 넷 중 겉모양으로 고르기 (구역마다 ${FIND_N}문제)`);
  out("");
  const strategies: [string, (opts: string[]) => string[]][] = [];
  for (const [label, f] of SHAPE_FEATURES) {
    strategies.push([`${label}인 것`, (o) => o.filter(f)]);
    strategies.push([`${label} 아닌 것`, (o) => o.filter((x) => !f(x))]);
  }
  const len = (x: string) => x.replace(/\s+/g, "").length;
  strategies.push(["가장 긴 것", (o) => o.filter((x) => len(x) === Math.max(...o.map(len)))]);
  strategies.push(["가장 짧은 것", (o) => o.filter((x) => len(x) === Math.min(...o.map(len)))]);
  const found: string[] = [];
  let worst = 0;
  for (const area of ["", ...regions.map((r) => r.sido)]) {
    const realSet = new Set(poolOf(area || null).reals.map((r) => r.name));
    const qs: { opts: string[]; real: string }[] = [];
    for (let i = 0; i < FIND_N; i++) {
      const seed = (Math.imul(i + 1, 2246822519) ^ 0x27d4eb2f) >>> 0;
      const { options } = findAt(seed, area, i % 20);
      qs.push({ opts: options, real: options.find((o) => realSet.has(o))! });
    }
    for (const [label, pickSet] of strategies) {
      let acc = 0;
      for (const q of qs) {
        const c = pickSet(q.opts);
        const cand = c.length ? c : q.opts;
        if (cand.includes(q.real)) acc += 1 / cand.length;
      }
      const rate = acc / qs.length;
      worst = Math.max(worst, rate);
      if (rate > 0.35) found.push(`${area ? areaLabel(area) : "전국"} · ${label} 고르기: ${pct(rate)} 적중`);
    }
  }
  if (found.length === 0) out(`어느 구역에서도 겉모양 수법이 35%를 못 넘습니다 (가장 높은 것 ${pct(worst)}, 찍기 25%).`);
  else {
    for (const f of found) out(`- ${f}`);
    warns.push(`진짜 찾기 겉모양 수법 ${found.length}건 (4번 참고)`);
  }
}

/* ---------- 5. 이름 조립: 미끼 조각이 티 나는가 ---------- */
/**
 * 조립 퍼즐은 정답 단지명의 조각 + 가짜 이름에서 떼어 온 미끼 조각으로 나온다. 미끼가
 * 길이·글자 모양만으로 걸러지면 퍼즐이 반쯤 풀린 채 나간다. 실제 출제(assembleAt)를 돌려
 * 조각 특징마다 "이 특징이면 미끼"라고 찍었을 때의 적중률을 감별 겉모양과 같은 잣대로 잰다.
 * 미끼 비율이 조각의 절반이 아니므로 각 쪽 안에서의 비율로 견준다.
 */
const AS_N = 200;
const PIECE_FEATURES: [string, (p: string) => boolean][] = [
  ["1~2자", (p) => p.length <= 2],
  ["5자 이상", (p) => p.length >= 5],
  ["영문 포함", (p) => /[A-Za-z]/.test(p)],
  ["숫자 포함", (p) => /\d/.test(p)],
  ['"아파트"로 끝', (p) => p.endsWith("아파트")],
  ['"마을"·"타운"으로 끝', (p) => /(마을|타운)$/.test(p)],
  ['"단지"로 끝', (p) => p.endsWith("단지")],
];
type Split = { ans: string[]; dec: string[] };
function pieceTells(where: string, { ans, dec }: Split, found: string[]) {
  for (const [label, f] of PIECE_FEATURES) {
    const rd = dec.filter(f).length / (dec.length || 1);
    const ra = ans.filter(f).length / (ans.length || 1);
    if ((rd + ra) / 2 < 0.05) continue;
    const g = rd / (rd + ra);
    if (g > 0.65 || g < 0.35)
      found.push(`${where} · ${label}: ${g > 0.5 ? "미끼로" : "정답 조각으로"} 찍으면 ${pct(Math.max(g, 1 - g))} (미끼 ${pct(rd)} 대 정답 ${pct(ra)})`);
  }
}

/** 공식전 조립은 지난 30일치 퍼즐을 그대로 다시 만들어 본다 (날짜 시드라 재현된다) */
function officialSplit(area: string): Split {
  const ans: string[] = [], dec: string[] = [];
  const today = new Date(Date.now() + 9 * 3600_000);
  for (let d = 0; d < 30; d++) {
    const date = new Date(today.getTime() - d * 86400_000).toISOString().slice(0, 10);
    // 정답은 판정 함수가 공개하는 것을 그대로 쓴다(출제 코드를 고치지 않고 재현한다)
    assembleForDate(date, area || null).forEach((q) => {
      const answer = checkAssemble(date, q.no, [], area || null)!.answer.split(" ");
      for (const p of q.pieces) (answer.includes(p) ? ans : dec).push(p);
    });
  }
  return { ans, dec };
}

function assembleTells() {
  out(`### 5. 이름 조립: 미끼 조각이 티 나는가 (무한 구역마다 ${AS_N}퍼즐 · 공식전 30일치)`);
  out("");
  const byId = new Map(apartments.map((a) => [a.id, a]));
  const found: string[] = [];
  const seenSido = new Set<string>();
  for (const area of ["", ...regions.map((r) => r.sido)]) {
    const ans: string[] = [], dec: string[] = [];
    let sido: string | null = null;
    for (let i = 0; i < AS_N; i++) {
      const seed = (Math.imul(i + 1, 3266489917) ^ 0x165667b1) >>> 0;
      const q = assembleAt(seed, area, i % 20);
      sido = q.sido;
      const answer = byId.get(q.id)!.name.split(" ");
      for (const p of q.pieces) (answer.includes(p) ? ans : dec).push(p);
    }
    // 조립 풀이 얇은 시·도는 전국으로 넓혀 내므로(assemblePoolOf) 전국과 같은 결과다. 한 번만 적는다
    const key = sido ?? "";
    if (seenSido.has(key)) continue;
    seenSido.add(key);
    const where = area ? areaLabel(area) : "전국";
    pieceTells(`무한 ${where}`, { ans, dec }, found);
    pieceTells(`공식전 ${where}`, officialSplit(area), found);
  }
  if (found.length === 0) out("어느 구역에서도 조각 길이·글자 모양으로 미끼를 65% 넘게 가려낼 수 없습니다.");
  else {
    for (const f of found) out(`- ${f}`);
    warns.push(`조립 미끼 겉모양 힌트 ${found.length}건 (5번 참고)`);
  }
}

await served().catch((e) => {
  out(`집계를 못 읽었습니다: ${(e as Error).message.slice(0, 120)}`);
  warns.push("실제 출제 집계를 못 읽었다");
});
out("");
rules();
out("");
looks();
out("");
findTells();
out("");
assembleTells();

const head = [`### 세 창구 주간 점검 · ${warns.length ? `주의 ${warns.length}건` : "이상 없음"}`, ""];
if (warns.length) head.push(...warns.map((w) => `> ${w}`), "");
const md = [...head, ...lines].join("\n");
console.log(md);
fs.writeFileSync("/tmp/balance.md", md + "\n");
