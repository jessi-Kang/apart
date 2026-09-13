#!/usr/bin/env node
/**
 * 승인된 작명을 출제 풀로 내보낸다.
 *
 * 왜 스크립트인가. 출제 풀은 정적 JSON이고 공식전은 (날짜, 구역) 시드로
 * 결정론이어야 한다. 런타임에 DB를 섞으면 같은 날 같은 구역인데 사람마다
 * 문제가 달라져 순위가 뜻을 잃는다. 그래서 승인은 표시로만 남기고, 실제
 * 출제는 여기서 파일에 넣은 뒤 커밋·배포하는 한 걸음을 더 둔다.
 *
 *   1) /report에서 승인 표시   2) npm run export-coined   3) validate-pool
 *   4) data/fake_names.json 커밋 → 배포
 *
 * 승인했다고 무조건 넣지 않는다. 승인 뒤에 실단지가 늘어나 겹치게 된 이름이
 * 있을 수 있어서, 넣기 전에 judgeName과 같은 잣대로 다시 한 번 거른다.
 *
 * 연결 문자열은 web/.env.local의 DATABASE_URL을 쓴다(커밋 금지).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POOL = path.join(WEB, "data/fake_names.json");
const APT = path.join(WEB, "data/apartments.json");

/** .env.local에서 한 값만 꺼낸다. dotenv를 얹지 않으려고 직접 읽는다 */
function envValue(key) {
  if (process.env[key]) return process.env[key];
  try {
    const raw = fs.readFileSync(path.join(WEB, ".env.local"), "utf8");
    const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

/** validate-pool·lib/naming.ts와 같은 잣대 (셋이 어긋나면 승인 못 할 이름을 넣게 된다) */
const ADMIN_NOISE =
  /관리사무소|\d{3,}\s*동|제\s*\d|\d+\s*구역|임대|\d+\s*호(?!반|텔)|주택도시공사|도시개발공사|SH공사/;

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

const tokenOverlap = (a, b) => {
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  return [...ta].filter((t) => tb.has(t)).length / Math.max(ta.size, tb.size);
};

async function main() {
  const url = envValue("DATABASE_URL");
  if (!url) {
    console.error("DATABASE_URL이 없다. web/.env.local에 넣거나 환경변수로 준다.");
    process.exit(1);
  }

  const pool = JSON.parse(fs.readFileSync(POOL, "utf8"));
  const reals = JSON.parse(fs.readFileSync(APT, "utf8")).items;
  const already = new Set(pool.items.map((f) => norm(f.name)));
  // 나눠 내보내도 id가 겹치면 안 된다. 이미 쓴 c번호 다음부터 이어 붙인다 —
  // 두 번째 실행에서 다시 c001부터 매기면 앞서 넣은 것과 충돌한다
  let nextId = pool.items.reduce((max, f) => {
    const m = /^c(\d+)$/.exec(String(f.id));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  const sql = neon(url);
  const rows = await sql`
    SELECT name FROM coined_name
    WHERE approved AND NOT rejected
    ORDER BY created_at`;
  console.log(`승인된 작명 ${rows.length}건`);

  const added = [];
  const skipped = [];
  // 한 번에 여럿을 넣을 때 자기들끼리 겹치는 것도 걸러야 한다
  const seen = new Set(already);

  for (const r of rows) {
    const name = String(r.name).trim().replace(/\s+/g, " ");
    const nf = norm(name);
    if (seen.has(nf)) {
      skipped.push([name, "이미 풀에 있음"]);
      continue;
    }
    if (ADMIN_NOISE.test(name)) {
      skipped.push([name, "관리 단위로 읽힌다"]);
      continue;
    }
    const clash = reals.find((a) => {
      const nr = norm(a.name);
      if (nf === nr) return true;
      const limit = Math.min(nf.length, nr.length) <= 5 ? 1 : Math.min(nf.length, nr.length) <= 11 ? 2 : 3;
      return editDistance(nf, nr) <= limit || tokenOverlap(name, a.name) >= 0.8;
    });
    if (clash) {
      // 승인한 뒤에 실단지가 늘어나 겹치게 된 경우가 여기로 온다
      skipped.push([name, `실단지와 겹친다: ${clash.name}`]);
      continue;
    }
    seen.add(nf);
    added.push({
      id: `c${String(++nextId).padStart(3, "0")}`,
      name,
      // 정답 공개 화면에 그대로 뜬다. 누가 지었는지는 밝히지 않는다 —
      // 이름 하나로 사람을 가리키게 되면 그때부터 놀림거리가 된다
      hint: "감별사가 작명소에서 직접 지은 이름입니다",
      difficulty: "mid",
      // 사람이 지은 것이라는 표시. 나중에 "작명소 이름은 얼마나 잘 속이나"를
      // 따로 세려면 구분할 자리가 있어야 한다
      coined: true,
    });
    // 접수할 때 고른 구역은 일부러 넣지 않는다. 어느 구역에서 낼지는 이름에
    // 든 지역 토큰이 정하고(lib/data.ts fakeAreas), 기존 523건도 그 규칙으로
    // 돈다. 필드를 하나 더 두면 규칙이 둘이 되고, 고른 구역과 이름이 어긋날
    // 때(부산을 골랐는데 이름에 지역어가 없다) 어느 쪽을 따를지 알 수 없다
  }

  for (const [name, why] of skipped) console.log(`  건너뜀  ${name} — ${why}`);
  if (!added.length) {
    console.log("새로 넣을 이름이 없다. 파일을 건드리지 않는다.");
    return;
  }

  pool.items.push(...added);
  fs.writeFileSync(POOL, `${JSON.stringify(pool, null, 2)}\n`);
  console.log(`\n${added.length}건을 출제 풀에 넣었다 (전체 ${pool.items.length}건).`);
  for (const a of added) console.log(`  + ${a.name}`);
  console.log("\n다음: npm run validate-pool 으로 검증한 뒤 data/fake_names.json을 커밋한다.");
}

await main();
