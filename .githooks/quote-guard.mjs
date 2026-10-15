#!/usr/bin/env node
/**
 * 대화 인용 막기. 운영자가 대화에서 한 말을 따옴표째 커밋 메시지·문서·주석에 옮기지 않는다.
 *
 * 왜: 커밋 메시지는 데브로그로 그대로 공개되고 문서도 공개 저장소에 있다. 대화에서 한
 * 말이 따옴표째 실린 적이 있고, 커밋 메시지에서 걷으려면 이력을 다시 써야 했다(서명이
 * 빠지고 강제 푸시가 필요하다). 들어가기 전에 막는 것이 유일하게 값싼 길이다.
 *
 * 무엇을 잡나: 누가 말했다는 서술과 따옴표가 같이 있는 줄. 단지명·화면 문구처럼 따옴표만
 * 있는 줄은 잡지 않는다(문서에는 그런 인용이 정상적으로 많다).
 *   - 따옴표 안 말이 반말·구어 어미로 끝난다(…야, …잖아, …스러워 같은 것)
 *   - 따옴표 앞뒤에 누가 말했다는 서술이 있다(말했다·했다고·반응·지적·의견·요청·하셨·물었)
 * 오탐이면 그 줄을 따옴표 없이 풀어 쓴다. 정말 필요한 인용이면 QUOTE_OK=1로 한 번 넘긴다.
 *
 *   node .githooks/quote-guard.mjs msg <커밋 메시지 파일>
 *   node .githooks/quote-guard.mjs staged        (스테이지된 추가 줄)
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

if (process.env.QUOTE_OK === "1") process.exit(0);

const Q = `["“'‘「]`;
const QE = `["”'’」]`;
const SAID = /(말했|했다고|[다라냐자]고 했|하셨|물었|반응|지적|의견|요청했|피드백|불평|투덜|하더라)/;
const SPOKEN = new RegExp(`${Q}[^"”'’」]{2,60}(야|네|잖아|거야|줘|래|냐|구나|더라|던데|ㅋ|ㅎ|싫어|별로|최악|스러워|이상해|모르겠)[?!.~]*${QE}`);

/**
 * 문단 단위로 본다. 한 문장이 두 줄에 걸치면 줄 단위로는 놓친다(실제로 놓쳤다).
 * 걸리는 조건: 따옴표 안이 구어 어미로 끝나거나, 따옴표 앞뒤 80자 안에 누가 말했다는 서술이 있다.
 */
function scan(text, where) {
  const bad = [];
  for (const para of text.split(/\n\s*\n/)) {
    const flat = para.replace(/\s*\n\s*/g, " ");
    const re = new RegExp(`${Q}([^"”'’」]{2,80})${QE}`, "g");
    let m;
    while ((m = re.exec(flat))) {
      const around = flat.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      if (SPOKEN.test(m[0]) || SAID.test(around)) {
        bad.push(`${where}: …${around.trim().slice(0, 140)}…`);
        break;
      }
    }
  }
  return bad;
}

const [mode, file] = process.argv.slice(2);
let bad = [];
if (mode === "msg") {
  bad = scan(fs.readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n"), "커밋 메시지");
} else if (mode === "staged") {
  const diff = execSync("git diff --cached -U0 --no-color -- . ':!*.json' ':!*.lock'", { encoding: "utf8" });
  let cur = "";
  const added = [];
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ b/")) cur = l.slice(6);
    else if (l.startsWith("+") && !l.startsWith("+++")) added.push([cur, l.slice(1)]);
  }
  for (const [f, l] of added) bad.push(...scan(l, f));
}
if (bad.length) {
  console.error("대화에서 들은 말을 따옴표째 옮긴 것 같은 줄이 있습니다. 따옴표 없이 풀어 쓰세요(CLAUDE.md '대화 인용 금지').");
  for (const b of bad) console.error("  " + b);
  console.error("오탐이면 QUOTE_OK=1 git commit ... 으로 한 번 넘깁니다.");
  process.exit(1);
}
