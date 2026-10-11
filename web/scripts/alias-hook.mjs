/**
 * 노드로 lib/*.ts를 바로 불러오게 하는 길잡이. 화면 코드가 쓰는 두 가지를 풀어 준다:
 * "@/…" 별칭(tsconfig paths)과 확장자 없는 "./data" 같은 상대 경로.
 * JSON은 import 속성이 없어도 JSON으로 읽힌다(Next 번들러가 해 주던 일).
 *
 *   node --experimental-strip-types --import ./scripts/alias-hook.mjs scripts/어떤것.mts
 *
 * 출제 규칙을 스크립트에 옮겨 적으면 둘이 갈라진다 — 점검은 실제 코드를 돌려야 한다.
 */
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const WEB = ${JSON.stringify(new URL("..", import.meta.url).href)};
export async function resolve(spec, ctx, next) {
  let s = spec;
  if (s.startsWith("@/")) s = new URL(s.slice(2), WEB).href;
  else if ((s.startsWith("./") || s.startsWith("../")) && ctx.parentURL) s = new URL(s, ctx.parentURL).href;
  if (s.startsWith("file:") && !/\\.[a-z]+$/.test(s) && existsSync(fileURLToPath(s + ".ts"))) s += ".ts";
  if (s.endsWith(".json")) return { ...(await next(s, ctx)), importAttributes: { type: "json" } };
  try {
    return await next(s, ctx);
  } catch (e) {
    // "next/headers"처럼 exports 표 없이 확장자를 생략한 꾸러미 경로
    if (e.code === "ERR_MODULE_NOT_FOUND" && !s.startsWith("file:")) return next(s + ".js", ctx);
    throw e;
  }
}`),
);
