import { TIME_LIMIT, type GameKey } from "./scoring";
import { HINT_FIRST } from "./hinttime";

/**
 * 창구 이용 안내 — 게임 화면 안에서 읽는 규칙.
 *
 * 홈 대장에는 한 줄 설명("이름 하나를 보고 진짜/가짜")밖에 없고, 창구에
 * 들어오면 바로 문제가 뜬다. 무엇을 눌러야 하는지, 틀리면 어떻게 되는지,
 * 제한 시간이 몇 초인지를 화면 안에서 알 방법이 없었다.
 *
 * 숫자는 규칙이 사는 곳에서 가져온다(scoring.ts·hinttime.ts). 안내에만
 * 손으로 적어 두면 규칙을 바꿀 때 안내가 먼저 거짓말을 한다.
 */

export function rulesFor(game: GameKey, official: boolean): string[] {
  // 한 줄은 짧게 — 안내 칸에서 한 줄에 들어가야 한다. 두 줄로 꺾이면서 꼬리가
  // 한 뼘만 남으면 글이 끊긴 것처럼 보인다(레이아웃 검사가 고아 줄로 잡는다).
  // 길게 설명하고 싶으면 문장을 줄이지 말고 줄을 하나 더 만든다.
  const how: Record<GameKey, string[]> = {
    ox: ["실제 단지면 진짜, AI 이름이면 가짜."],
    findreal: ["넷 중 실제 단지는 하나뿐입니다."],
    assemble: ["조각을 눌러 단지명을 채웁니다.", "잘못 넣었으면 비우고 다시 넣습니다."],
  };
  const out = [...how[game], `제한 ${TIME_LIMIT[game]}초, 빠를수록 점수가 높습니다.`];
  if (game === "assemble") {
    // 마지막 힌트 시각(33초)까지 적으면 줄이 길어진다. 화면 아래 힌트 줄이
    // 그 판의 실제 시각을 말하므로 여기서는 "언제부터"만 알려 준다
    out.push(`${HINT_FIRST}초부터 초성이 한 글자씩 열립니다.`);
    out.push("힌트를 받으면 점수가 깎입니다.");
  }
  if (official) {
    out.push("10문제를 치릅니다.");
    out.push("같은 날 같은 구역이면 문제가 같습니다.");
  } else {
    out.push("틀려도 판은 이어집니다.");
    out.push("다만 연속이 끊깁니다.");
  }
  return out;
}
