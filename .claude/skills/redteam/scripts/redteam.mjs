#!/usr/bin/env node
/**
 * 아파트 감별사 레드팀 점검기.
 *
 * 자기 것을 자기가 두드린다. 로컬(localhost:3000)에만 대고 돌린다 —
 * 운영 사이트에 같은 짓을 하면 그건 점검이 아니라 공격이다.
 *
 * 통과 기준은 "막혔다는 증거"다. 코드에 가드가 있는지가 아니라, 실제로
 * 던져 보고 막혔는지를 본다.
 */

import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WEB = path.join(ROOT, "web");
const BASE = process.env.REDTEAM_BASE ?? "http://localhost:3000";

const pass = [];
const fail = [];
const skip = [];
const ok = (name, detail) => pass.push(`${name}${detail ? ` — ${detail}` : ""}`);
const bad = (name, detail) => fail.push(`${name}\n         ${detail}`);
const unknown = (name, why) => skip.push(`${name} — ${why}`);

/* ---------- 환경 ---------- */

function env() {
  try {
    const raw = fs.readFileSync(path.join(WEB, ".env.local"), "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}
const ENV = env();

const b64 = (s) => Buffer.from(s).toString("base64url");

/** 서명한 세션 토큰. 키를 알아야만 만들 수 있다는 것이 이 점검의 대조군이다 */
function token({ uid = 1, name = "점검", own = false, ttl = 3600 } = {}) {
  if (!ENV.AUTH_SECRET) return null;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = b64(JSON.stringify({ uid, name, exp, ...(own && { own: true }) }));
  return `${payload}.${createHmac("sha256", ENV.AUTH_SECRET).update(payload).digest("base64url")}`;
}

async function req(pathname, { cookie, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML 응답 */
  }
  return { status: res.status, text, json, headers: res.headers };
}

/**
 * 쿠키를 이어 주는 요청기. 서버가 판 진행 상태를 쿠키로 들고 있어서,
 * 한 판을 흉내 내려면 받은 쿠키를 되돌려 보내야 한다.
 */
function jar(initial = "") {
  let cookie = initial;
  return {
    get cookie() {
      return cookie;
    },
    drop() {
      cookie = initial;
    },
    async req(pathname, opts = {}) {
      const r = await req(pathname, { ...opts, cookie: cookie || undefined });
      const set = r.headers.get("set-cookie");
      if (set) {
        // 여러 쿠키가 한 줄로 합쳐져 오기도 한다. 이름=값만 추려 이어 붙인다
        const parts = set.split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim());
        const map = new Map(
          (cookie ? cookie.split("; ") : []).filter(Boolean).map((c) => [c.split("=")[0], c]),
        );
        for (const pcookie of parts) map.set(pcookie.split("=")[0], pcookie);
        cookie = [...map.values()].join("; ");
      }
      return r;
    },
  };
}

const sess = (t) => (t ? `aptgam_session=${t}` : undefined);
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/* ---------- 1. 세션 ---------- */

async function session() {
  const good = token({ own: true });
  if (!good) {
    unknown("[세션] 위조 토큰 거부", "web/.env.local에 AUTH_SECRET이 없어 대조군을 못 만든다");
    return;
  }
  const payload = good.split(".")[0];
  const sig = good.split(".")[1];
  const otherPayload = b64(
    JSON.stringify({ uid: 2, name: "남", exp: Math.floor(Date.now() / 1000) + 3600, own: true }),
  );

  const cases = [
    ["쿠키 없음", undefined],
    ["서명을 뗀 토큰", payload],
    ["본문만 바꾸고 옛 서명", `${otherPayload}.${sig}`],
    ["서명 자리가 빈 값", `${payload}.`],
    ["서명 길이가 다른 값", `${payload}.AA`],
    ["만료된 토큰(서명은 정상)", token({ own: true, ttl: -60 })],
    ["점 없는 아무 문자열", "not-a-token"],
  ];
  const broke = [];
  for (const [label, t] of cases) {
    const r = await req("/api/state", { cookie: sess(t) });
    if (r.status !== 401) broke.push(`${label} → ${r.status} (401이어야 한다)`);
  }
  if (broke.length) bad("[세션] 위조 토큰 거부", broke.join("\n         "));
  else ok("[세션] 위조 토큰 거부", `${cases.length}가지 전부 401`);

  // 대조군: 키로 서명한 토큰은 열린다. 전부 막히면 가드가 아니라 고장이다
  const r = await req("/api/auth/me", { cookie: sess(good) });
  if (r.json?.user?.owner === true) ok("[세션] 키로 서명한 토큰만 운영자로 인정", "대조군 통과");
  else bad("[세션] 키로 서명한 토큰만 운영자로 인정", `대조군이 안 열린다: ${r.status} ${r.text.slice(0, 120)}`);

  // own을 스스로 붙였지만 서명이 없는 토큰
  const forgedOwn = b64(
    JSON.stringify({ uid: 9, name: "가짜운영자", exp: Math.floor(Date.now() / 1000) + 3600, own: true }),
  );
  const r2 = await req("/api/coined", { cookie: sess(`${forgedOwn}.${"A".repeat(43)}`) });
  if (r2.status === 404) ok("[세션] own을 스스로 적어 넣은 토큰", "운영자 목록 404");
  else bad("[세션] own을 스스로 적어 넣은 토큰", `/api/coined → ${r2.status} ${r2.text.slice(0, 120)}`);
}

/* ---------- 2. 창구 가드 ---------- */

const LEAKY = /unauthorized|forbidden|권한|운영자만|not_allowed/i;

async function guard() {
  const plain = token({ uid: 2, name: "보통", own: false });
  const owner = token({ own: true });
  if (!owner) {
    unknown("[가드] 전개 전 창구·운영자 화면", "AUTH_SECRET이 없어 로그인 분기를 못 만든다");
    return;
  }

  const targets = [
    "/n",
    `/api/naming?area=${encodeURIComponent("서울특별시")}`,
    "/api/coined/mine",
    "/ops",
    "/report",
    "/api/ops",
    "/api/report",
    "/api/coined",
    "/api/bug",
  ];
  const holes = [];
  const leaks = [];
  for (const t of targets) {
    for (const [who, cookie] of [
      ["비로그인", undefined],
      ["일반 로그인", sess(plain)],
    ]) {
      const r = await req(t, { cookie });
      if (r.status !== 404) holes.push(`${who} → ${t} = ${r.status}`);
      if (LEAKY.test(r.text.slice(0, 400))) leaks.push(`${who} → ${t}: 본문이 권한 문제를 알린다`);
    }
  }
  const p = await req("/api/naming", {
    method: "POST",
    body: { name: "점검용이름", area: "서울특별시" },
  });
  if (p.status !== 404) holes.push(`비로그인 → POST /api/naming = ${p.status}`);

  if (holes.length) bad("[가드] 전개 전 창구·운영자 화면", holes.join("\n         "));
  else ok("[가드] 전개 전 창구·운영자 화면", `${targets.length}곳 x 2분기 전부 404`);
  if (leaks.length) bad("[가드] 404로만 답하는가", leaks.join("\n         "));
  else ok("[가드] 404로만 답하는가", "본문에 권한 문구 없음");

  const closed = [];
  for (const t of ["/n", "/api/coined/mine", "/ops", "/api/ops", "/api/coined"]) {
    const r = await req(t, { cookie: sess(owner) });
    if (r.status !== 200) closed.push(`${t} = ${r.status}`);
  }
  if (closed.length) bad("[가드] 운영자에게는 열리는가", `막혀 있다: ${closed.join(", ")}`);
  else ok("[가드] 운영자에게는 열리는가", "5곳 전부 200");
}

/* ---------- 3. 정답 유출 ---------- */

const ANSWER_KEYS = ["kind", "answer", "real", "fake", "correct", "isReal"];

async function answer() {
  const feeds = [
    "/api/quiz/today",
    "/api/assemble/today",
    "/api/findreal/today",
    "/api/endless/ox",
    "/api/endless/find",
  ];
  const leaked = [];
  for (const f of feeds) {
    const r = await req(f);
    if (r.status !== 200 || !r.json) continue;
    const flat = JSON.stringify(r.json);
    for (const k of ANSWER_KEYS) {
      if (new RegExp(`"${k}"\\s*:`).test(flat)) leaked.push(`${f} 응답에 "${k}" 키가 있다`);
    }
  }
  if (leaked.length) bad("[정답] 출제 응답에 정답이 없는가", leaked.join("\n         "));
  else ok("[정답] 출제 응답에 정답이 없는가", `창구 응답 ${feeds.length}종 전부 깨끗`);

  // 클라이언트 번들에 가짜 이름 목록이 통째로 실렸는가
  const fakes = JSON.parse(fs.readFileSync(path.join(WEB, "data/fake_names.json"), "utf8")).items ?? [];
  const sample = fakes.slice(0, 40).map((f) => f.name);
  const dir = path.join(WEB, ".next/static");
  if (!fs.existsSync(dir)) {
    unknown("[정답] 번들에 가짜 이름이 실렸는가", ".next/static이 없다 (npm run build 먼저)");
  } else {
    const hits = [];
    for (const file of walk(dir)) {
      if (!/\.js$/.test(file)) continue;
      const txt = fs.readFileSync(file, "utf8");
      const found = sample.filter((n) => txt.includes(n));
      if (found.length >= 3) {
        hits.push(`${path.relative(WEB, file)}에 ${found.length}건 (${found.slice(0, 3).join(", ")})`);
      }
    }
    if (hits.length) bad("[정답] 번들에 가짜 이름이 실렸는가", hits.join("\n         "));
    else ok("[정답] 번들에 가짜 이름이 실렸는가", `표본 ${sample.length}건 중 0건`);
  }

  // 흔적 없이 정답을 캐는 스위치가 남아 있는가.
  // 한때 practice:true가 "판정은 해 주되 집계에는 안 넣는" 문을 열어 두고 있었다.
  // 어느 화면도 보낸 적이 없는데 API만 받아 주고 있었다.
  const today = await req("/api/quiz/today");
  if (!today.json?.items?.length) {
    unknown("[정답] 흔적 없이 정답을 캐는 스위치", "오늘의 문제를 못 받았다");
    unknown("[정답] 같은 문제를 다시 받아 주는가", "오늘의 문제를 못 받았다");
    return;
  }
  const date = today.json.date;
  const no = today.json.items[0].no;

  const sneaky = [];
  for (const flag of [{ practice: true }, { dryRun: true }, { noStat: true }]) {
    const r = await req("/api/quiz/answer", { method: "POST", body: { date, no, choice: "real", ...flag } });
    // 응답에 판정이 실리는 것 자체는 정상이다. 문제가 되는 건 그 스위치가
    // "집계에 안 남는다"고 실제로 동작할 때인데, 그건 코드에서 확인한다
    if (r.status === 200 && "practice" in flag) sneaky.push("practice 스위치가 아직 받아들여진다");
  }
  const src = ["app/api/quiz/answer/route.ts", "app/api/assemble/check/route.ts", "app/api/findreal/check/route.ts"]
    .map((f) => fs.readFileSync(path.join(WEB, f), "utf8"))
    .join("\n");
  if (/body\.practice\s*!==\s*true|practice\?:\s*boolean/.test(src)) {
    bad(
      "[정답] 흔적 없이 정답을 캐는 스위치",
      "판정 라우트가 아직 집계를 건너뛰는 스위치를 읽는다. 어느 화면도 보내지 않는 값이면 지운다",
    );
  } else {
    ok("[정답] 흔적 없이 정답을 캐는 스위치", "판정 라우트 3곳에 집계 우회 스위치 없음");
  }

  // 한 판 안에서 답을 바꿀 수 있는가.
  //
  // 즉시 정답 공개가 설계라 "첫 답에 정답이 드러나는 것"은 못 막는다. 막아야
  // 하는 건 알고 나서 답을 바꾸는 쪽이라, 거절(409)이 아니라 첫 답 고정이
  // 통과 조건이다 — 네트워크가 끊겨 같은 요청이 두 번 가는 일이 실제로 있고,
  // 그때 막아 버리면 정직하게 친 사람이 문제를 잃는다.
  const run = jar();
  const a1 = await run.req("/api/quiz/answer", { method: "POST", body: { date, no, choice: "real" } });
  const a2 = await run.req("/api/quiz/answer", { method: "POST", body: { date, no, choice: "fake" } });
  if (a1.status !== 200 || a2.status !== 200) {
    unknown("[정답] 한 판에서 답을 바꿀 수 있는가", `판정이 안 돌아온다 (${a1.status}, ${a2.status})`);
  } else if (a2.json?.replay === true && a2.json?.correct === a1.json?.correct) {
    ok("[정답] 한 판에서 답을 바꿀 수 있는가", "두 번째 답은 첫 판정 그대로 (replay)");
  } else {
    bad(
      "[정답] 한 판에서 답을 바꿀 수 있는가",
      `real로 ${a1.json?.correct} 받은 뒤 fake로 바꾸니 ${a2.json?.correct}가 됐다.\n` +
        "         한 문제에 양쪽을 다 눌러 보면 그날 공식전을 만점으로 칠 수 있다.",
    );
  }

  // 쿠키를 버리고 와도 첫 답이 남는가. 로그인한 사람은 DB에도 남아야 한다
  const owner = token({ own: true });
  if (!owner) {
    unknown("[정답] 쿠키를 버려도 첫 답이 남는가", "AUTH_SECRET이 없어 로그인 분기를 못 만든다");
  } else if (process.env.REDTEAM_DB !== "1") {
    // .env.local에 연결 문자열이 있는 것과 "지금 띄운 서버가 DB에 붙어 있는
    // 것"은 다르다. 파일만 보고 판단했다가 DB 없이 띄운 서버를 두고 방어가
    // 뚫렸다고 잘못 적은 적이 있다. 계정 쪽 잠금은 DB를 붙인 별도 실행에서만 잰다
    unknown(
      "[정답] 쿠키를 버려도 첫 답이 남는가",
      "이 점검은 DB를 떼고 돌린다. 계정 쪽 잠금은 DB를 붙여 띄운 뒤 REDTEAM_DB=1로 따로 잰다",
    );
  } else {
    const no2 = today.json.items[1]?.no ?? no;
    const c = sess(owner);
    const b1 = await req("/api/quiz/answer", { method: "POST", cookie: c, body: { date, no: no2, choice: "real" } });
    const b2 = await req("/api/quiz/answer", { method: "POST", cookie: c, body: { date, no: no2, choice: "fake" } });
    if (b2.json?.replay === true && b2.json?.correct === b1.json?.correct) {
      ok("[정답] 쿠키를 버려도 첫 답이 남는가", "계정에 첫 답이 남아 판정이 안 바뀐다");
    } else {
      bad(
        "[정답] 쿠키를 버려도 첫 답이 남는가",
        "판 쿠키 없이 다시 답했더니 판정이 바뀌었다. 쿠키를 지우면 그만인 방어다.",
      );
    }
  }

  // 비회원이 판을 새로 열면 여전히 한 문제씩 캘 수 있다. 못 막는 것을
  // 막았다고 적어 두지 않는다 — 판을 계정에 묶기 전까지 남는 구멍이다
  unknown(
    "[정답] 비회원이 판을 새로 열어 캐는 것",
    "쿠키를 버리고 다시 열면 한 문제씩은 캘 수 있다. 판을 계정에 묶어야 닫힌다",
  );
}

/* ---------- 4. 입력 검증 ---------- */

const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(27);
const RLO = String.fromCharCode(0x202e);

const NASTY = [
  ["아주 긴 문자열", "가".repeat(100_000)],
  ["SQL 조각", "'; DROP TABLE coined_name; --"],
  ["HTML 태그", "<script>alert(1)</script>"],
  ["제어문자", `이름${NUL}${ESC}[31m`],
  ["방향 제어문자", `이름${RLO}가짜`],
  ["빈 문자열", ""],
  ["공백만", "     "],
];

async function input() {
  const owner = token({ own: true });

  // 작명 접수 (전개 전이라 운영자 쿠키로 찌른다)
  if (owner) {
    const crashes = [];
    for (const [label, value] of NASTY) {
      const r = await req("/api/naming", {
        method: "POST",
        body: { name: value, area: "서울특별시" },
        cookie: sess(owner),
      });
      if (r.status >= 500) crashes.push(`작명/${label} → ${r.status}`);
      else if (r.status === 200 && r.json?.verdict?.ok === true) crashes.push(`작명/${label} → 통과해 버렸다`);
    }
    if (crashes.length) bad("[입력] 작명 이름", crashes.join("\n         "));
    else ok("[입력] 작명 이름", `${NASTY.length}가지 전부 거부, 500 없음`);
  } else {
    unknown("[입력] 작명 이름", "AUTH_SECRET이 없어 전개 전 창구를 못 연다");
  }

  // 구역 값: 모르는 값은 전국으로 떨어져야 한다
  const weird = ["<script>", "'; DROP TABLE question_stats; --", "서울특별시아님", "가".repeat(500)];
  const bleeding = [];
  for (const a of weird) {
    const r = await req(`/api/quiz/today?area=${encodeURIComponent(a)}`);
    if (r.status >= 500) bleeding.push(`area=${a.slice(0, 20)} → ${r.status}`);
    else if (r.json && r.json.area !== "") bleeding.push(`area=${a.slice(0, 20)} → 구역이 "${r.json.area}"로 남았다`);
  }
  if (bleeding.length) bad("[입력] 모르는 구역 값", bleeding.join("\n         "));
  else ok("[입력] 모르는 구역 값", `${weird.length}가지 전부 전국으로 떨어짐`);

  // 판정 요청의 번호·날짜
  const today = kstToday();
  const outOfRange = [];
  for (const body of [
    { date: "2020-01-01", no: 1, choice: "real" },
    { date: today, no: 0, choice: "real" },
    { date: today, no: 9999, choice: "real" },
    { date: today, no: 1, choice: "cheat" },
  ]) {
    const r = await req("/api/quiz/answer", { method: "POST", body });
    if (r.status !== 400) outOfRange.push(`${JSON.stringify(body)} → ${r.status}`);
  }
  if (outOfRange.length) bad("[입력] 판정 요청의 번호·날짜", outOfRange.join("\n         "));
  else ok("[입력] 판정 요청의 번호·날짜", "범위 밖 4가지 전부 400");

  // 기록 동기화: 본문 크기와 구역 수 상한
  if (owner) {
    const big = await req("/api/state", {
      method: "PUT",
      cookie: sess(owner),
      body: { v: 1, pad: "x".repeat(9000) },
    });
    if (big.status !== 413) bad("[입력] 기록 동기화 본문 크기", `9KB 본문 → ${big.status} (413이어야 한다)`);
    else ok("[입력] 기록 동기화 본문 크기", "8KB 넘으면 413");

    const areaXp = {};
    for (let i = 0; i < 200; i++) areaXp[`쓰레기구역${i}`] = 999_999_999;
    const flood = await req("/api/state", { method: "PUT", cookie: sess(owner), body: { v: 1, areaXp } });
    if (flood.status === 503) {
      // DB를 떼고 띄우면 저장이 없어 병합 결과를 못 돌려준다. 못 본 것은 못 봤다고 남긴다
      unknown("[입력] 구역 수 상한", "DB 없이 띄워 병합 결과를 못 받았다 (503)");
    } else if (flood.status >= 500) {
      bad("[입력] 구역 수 상한", `구역 200개 → ${flood.status}`);
    } else {
      const kept = Object.keys(flood.json?.state?.areaXp ?? {}).length;
      if (kept > 40) bad("[입력] 구역 수 상한", `구역 200개를 밀어 넣었더니 ${kept}개가 남았다`);
      else ok("[입력] 구역 수 상한", `200개 중 ${kept}개만 남음 (DB 없이 띄웠으면 0)`);
    }
  }

  // 버그 제보: 본인 확인과 허니팟
  const noCaptcha = await req("/api/bug", {
    method: "POST",
    body: { body: "점검용 제보입니다. 무시하세요.", answer: "1234" },
  });
  if (noCaptcha.status === 400 && noCaptcha.json?.error === "captcha") {
    ok("[입력] 버그 제보 본인 확인", "쿠키 없는 제출은 400");
  } else {
    bad("[입력] 버그 제보 본인 확인", `본인 확인 없이 → ${noCaptcha.status} ${noCaptcha.text.slice(0, 120)}`);
  }

  const honey = await req("/api/bug", {
    method: "POST",
    body: { body: "점검용 제보입니다. 무시하세요.", nickname: "bot" },
  });
  if (honey.status === 200 && honey.json?.ok === true) {
    ok("[입력] 버그 제보 허니팟", "채워 오면 조용히 성공으로 답함");
  } else {
    bad("[입력] 버그 제보 허니팟", `허니팟 채운 요청 → ${honey.status} (막혔다고 알려 주면 다음엔 비우고 온다)`);
  }
}

/* ---------- 5. 비밀 유출 ---------- */

const SECRET_PATTERNS = [
  [/postgres(?:ql)?:\/\/[^\s"']+/i, "연결 문자열"],
  [/\bnpg_[A-Za-z0-9]{16,}/, "Neon 비밀번호"],
  [/AUTH_SECRET\s*=\s*\S+/, "서명 키"],
  [/KAPT_API_KEY\s*=\s*\S+/, "공공데이터 인증키"],
  [/GOCSPX-[A-Za-z0-9_-]{20,}/, "구글 클라이언트 시크릿"],
];

function secret() {
  let tracked = [];
  try {
    tracked = execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" }).trim().split("\n");
  } catch {
    unknown("[비밀] 추적 파일 검사", "git 목록을 못 읽었다");
  }
  const found = [];
  for (const rel of tracked) {
    if (!rel || /^(web\/data\/|web\/public\/|design\/)/.test(rel)) continue;
    const abs = path.join(ROOT, rel);
    let txt;
    try {
      if (fs.statSync(abs).size > 2_000_000) continue;
      txt = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const [re, what] of SECRET_PATTERNS) {
      const m = txt.match(re);
      // 문서에 적힌 이름만(값 없이)은 넘긴다
      if (m && !/=\s*(\*{3}|<|\.\.\.|$)/.test(m[0])) found.push(`${rel}: ${what} (${m[0].slice(0, 40)} …)`);
    }
  }
  if (found.length) bad("[비밀] 추적 파일에 비밀이 있는가", found.join("\n         "));
  else ok("[비밀] 추적 파일에 비밀이 있는가", `${tracked.length}개 파일 검사, 0건`);

  const envFiles = tracked.filter((f) => /\.env(\.|$)/.test(f) && !/\.example$/.test(f));
  if (envFiles.length) bad("[비밀] .env 파일 추적", `추적 중: ${envFiles.join(", ")}`);
  else ok("[비밀] .env 파일 추적", "추적되지 않음");

  try {
    const log = execFileSync("git", ["-C", ROOT, "log", "-80", "--format=%H %s%n%b"], { encoding: "utf8" });
    const hits = SECRET_PATTERNS.filter(([re]) => re.test(log)).map(([, what]) => what);
    if (hits.length) bad("[비밀] 커밋 메시지", `최근 80커밋에 ${hits.join(", ")} 패턴`);
    else ok("[비밀] 커밋 메시지", "최근 80커밋 깨끗 (공개 일지로 그대로 나간다)");
  } catch {
    unknown("[비밀] 커밋 메시지", "git log를 못 읽었다");
  }

  const dir = path.join(WEB, ".next/static");
  if (!fs.existsSync(dir)) {
    unknown("[비밀] 클라이언트 번들", ".next/static이 없다 (npm run build 먼저)");
    return;
  }
  const values = Object.entries(ENV).filter(([k, v]) => v.length >= 12 && !k.startsWith("NEXT_PUBLIC_"));
  const bleed = [];
  const maps = [];
  for (const file of walk(dir)) {
    if (file.endsWith(".map")) maps.push(file);
    if (!/\.js$/.test(file)) continue;
    const txt = fs.readFileSync(file, "utf8");
    for (const [k, v] of values) if (txt.includes(v)) bleed.push(`${path.relative(WEB, file)}에 ${k} 값`);
  }
  if (bleed.length) bad("[비밀] 클라이언트 번들", bleed.join("\n         "));
  else ok("[비밀] 클라이언트 번들", `환경변수 ${values.length}개 값으로 찾아 0건`);
  if (maps.length) bad("[비밀] 소스맵", `${maps.length}개가 함께 나간다 (${path.basename(maps[0])} 등)`);
  else ok("[비밀] 소스맵", "배포본에 없음");
}

/* ---------- 6. 헤더·리디렉션 ---------- */

async function header() {
  const owner = token({ own: true });

  if (owner) {
    const r = await req("/api/coined/mine", { cookie: sess(owner) });
    const cc = r.headers.get("cache-control") ?? "";
    if (/no-store/.test(cc)) ok("[헤더] 개인 응답 캐시 금지", `Cache-Control: ${cc}`);
    else bad("[헤더] 개인 응답 캐시 금지", `/api/coined/mine → Cache-Control: ${cc || "없음"}`);
  }

  // 세션 쿠키는 구글 콜백에서만 내려온다. 구글 없이는 그 응답을 못 찍으므로
  // 쿠키를 심는 코드를 직접 읽는다. 로그아웃의 "삭제 쿠키"에는 속성이 안 붙어
  // 있는 게 정상이라, 그쪽을 보면 매번 잘못된 실패가 난다
  const cb = fs.readFileSync(path.join(WEB, "app/api/auth/callback/route.ts"), "utf8");
  const block = cb.slice(cb.indexOf("cookies.set(SESSION_COOKIE"), cb.indexOf("cookies.set(SESSION_COOKIE") + 400);
  const missing = [];
  if (!/httpOnly:\s*true/.test(block)) missing.push("HttpOnly");
  if (!/sameSite:\s*"(lax|strict)"/.test(block)) missing.push("SameSite");
  if (!/secure:/.test(block)) missing.push("Secure");
  if (!block) unknown("[헤더] 세션 쿠키 속성", "콜백에서 쿠키 설정을 못 찾았다");
  else if (missing.length) bad("[헤더] 세션 쿠키 속성", `빠진 속성: ${missing.join(", ")}`);
  else ok("[헤더] 세션 쿠키 속성", "HttpOnly · SameSite · Secure(프로덕션) 전부 있음");

  // 로그아웃은 GET으로도 되면 남의 링크 한 번에 로그아웃당한다
  const getLogout = await req("/api/auth/logout");
  if (getLogout.status === 405 || getLogout.status === 404) ok("[헤더] 로그아웃은 POST만", `GET → ${getLogout.status}`);
  else bad("[헤더] 로그아웃은 POST만", `GET /api/auth/logout → ${getLogout.status}`);

  const evil = await req("/api/auth/login?next=https://evil.example&redirect_uri=https://evil.example");
  const loc = evil.headers.get("location") ?? "";
  if (/evil\.example/.test(loc)) {
    bad("[헤더] 로그인 오픈 리디렉트", `Location에 남의 주소가 들어갔다: ${loc.slice(0, 160)}`);
  } else {
    ok("[헤더] 로그인 오픈 리디렉트", "쿼리로 넘긴 주소가 리디렉션에 안 들어감");
  }

  const home = await req("/");
  if (/<meta name="robots" content="noindex"/.test(home.text)) ok("[헤더] 색인 차단", "noindex 유지");
  else unknown("[헤더] 색인 차단", "noindex가 없다 — 공개하기로 했다면 정상이다");
}

/* ---------- 실행 ---------- */

const SECTIONS = { session, guard, answer, input, secret, header };

async function main() {
  const want = process.argv[2] ?? "all";
  const names = want === "all" ? Object.keys(SECTIONS) : [want];
  for (const n of names) {
    const fn = SECTIONS[n];
    if (!fn) {
      console.error(`모르는 항목: ${n} (${Object.keys(SECTIONS).join("|")}|all)`);
      process.exit(2);
    }
    try {
      await fn();
    } catch (e) {
      bad(`[${n}] 점검 자체가 멈췄다`, String(e && e.message ? e.message : e));
    }
  }

  console.log("");
  for (const p of pass) console.log(`  OK  ${p}`);
  for (const s of skip) console.log(`확인못함  ${s}`);
  for (const f of fail) console.log(`실패  ${f}`);
  console.log(`\n통과 ${pass.length} / 실패 ${fail.length} / 확인 못 함 ${skip.length}`);
  process.exit(0);
}

await main();
