#!/usr/bin/env node
/**
 * 주간 점검: 진짜·가짜 비율 (.github/workflows/weekly-balance.yml)
 *
 *   npm run weekly-balance            # DATABASE_URL이 있으면 실제 출제분까지
 *
 * 감별은 진짜:가짜가 반반이어야 "모르면 반은 맞는" 게임이 된다. 그 반반이 세 군데서
 * 어긋날 수 있다:
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
import { oxAt } from "../lib/run.ts";
import { poolOf, regions, areaLabel } from "../lib/data.ts";

const RUNS = 300; // 모의로 칠 판 수
const LEN = 20; // 한 판에 몇 문제까지 보나 (무한 판 대부분이 이 안에서 끝난다)
const lines: string[] = [];
const warns: string[] = [];
const out = (s = "") => lines.push(s);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/* ---------- 1. 실제로 나간 문제 ---------- */
async function served() {
  out("### 1. 실제로 나간 문제 (감별 O/X, 지난 점검 이후)");
  const url = process.env.DATABASE_URL;
  if (!url) {
    out("DATABASE_URL이 없어 건너뜀 — 출제 규칙·풀만 봤습니다.");
    return;
  }
  const sql = neon(url);
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
  out(`| 구역 | 실단지 | 가짜 | 가짜 되풀이 (${SEEN}개 볼 때) |`);
  out("|---|---:|---:|---:|");
  for (const area of ["", ...regions.map((r) => r.sido)]) {
    const { reals, fakes } = poolOf(area || null);
    const rep = repeatOf(fakes.length);
    const label = area ? areaLabel(area) : "전국";
    out(`| ${label} | ${reals.length.toLocaleString()} | ${fakes.length.toLocaleString()} | ${pct(rep)} |`);
    if (rep > 0.15) warns.push(`${label}: 가짜가 얇다 (${fakes.length}건 — ${SEEN}개 중 ${pct(rep)}가 본 것)`);
  }
}

/* ---------- 3. 겉모양 ---------- */
function looks() {
  out("### 3. 겉모양으로 찍을 수 있는가");
  out("");
  // qa.mjs의 겉모양 검사와 같은 잣대: 그 특징이 있으면 무조건 가짜라고 찍었을 때 적중률
  const bare = (n: string) => n.replace(/\s+/g, "");
  const feats: [string, (n: string) => boolean][] = [
    ["띄어쓰기 있음", (n) => /\s/.test(n)],
    ["6자 이하", (n) => bare(n).length <= 6],
    ["11자 이상", (n) => bare(n).length >= 11],
    ...["아파트", "마을", "타운", "맨션"].map((w) => [`"${w}"로 끝`, (n: string) => bare(n).endsWith(w)] as [string, (n: string) => boolean]),
  ];
  const areas = ["", ...regions.map((r) => r.sido)];
  const found: string[] = [];
  // "아파트"로 끝나면 진짜 쪽이 많은 것처럼 반대 방향도 힌트다 — 찍을 쪽만 다르다
  for (const area of areas) {
    const { reals, fakes } = poolOf(area || null);
    const rate = (arr: { name: string }[], f: (n: string) => boolean) => arr.filter((x) => f(x.name)).length / (arr.length || 1);
    for (const [label, f] of feats) {
      const rf = rate(fakes, f), rr = rate(reals, f);
      // 그 특징이 드문 것이면(문제 스물에 하나 꼴도 안 되면) 힌트가 돼도 판을 못 흔든다
      if ((rf + rr) / 2 < 0.05) continue;
      const g = rf / (rf + rr);
      if (g > 0.65 || g < 0.35)
        found.push(`${area ? areaLabel(area) : "전국"} · ${label}: ${g > 0.5 ? "가짜" : "진짜"}로 찍으면 ${pct(Math.max(g, 1 - g))} 적중 (가짜 ${pct(rf)} 대 실단지 ${pct(rr)})`);
    }
  }
  if (found.length === 0) out("구역마다 띄어쓰기·글자 수·끝 낱말 어느 것으로도 65% 넘게 찍을 수 없습니다.");
  else {
    for (const f of found) out(`- ${f}`);
    warns.push(`겉모양 힌트 ${found.length}건 (3번 참고)`);
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

const head = [`### 진짜·가짜 비율 주간 점검 · ${warns.length ? `주의 ${warns.length}건` : "이상 없음"}`, ""];
if (warns.length) head.push(...warns.map((w) => `> ${w}`), "");
const md = [...head, ...lines].join("\n");
console.log(md);
fs.writeFileSync("/tmp/balance.md", md + "\n");
