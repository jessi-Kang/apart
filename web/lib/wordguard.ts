/**
 * 지은 이름 말 거르기.
 *
 * 사람이 짓는 이름이라 형식 검사만으로는 부족하다. 그렇다고 전부 사람이
 * 읽으면 손이 끝없이 든다. 그래서 세 갈래로 나눈다.
 *
 *   거부(block)   명백한 것. 접수 자체를 막고 그 자리에서 고치게 한다.
 *                 나중에 반려하면 지은 사람은 왜 안 나오는지 모른 채 기다린다.
 *   보류(review)  조금이라도 걸리는 것. 접수는 되지만 사람이 보고 정한다.
 *   통과(pass)    아무 신호도 없는 것. 자동으로 출제 대기로 간다.
 *
 * 사전이 약하면 보류가 쌓이고, 사전이 거칠면 멀쩡한 이름이 막힌다. 둘 다
 * 나쁘므로 **실단지 12,121건을 전부 통과시켜 오탐이 0인지** 확인한 뒤에만
 * 항목을 늘린다(`npm run check-wordguard`). 실제로 "성당"은 대구 성당동이
 * 있어서 뺐고, "서민"·"임대" 같은 말도 그 검사에서 걸러 정리했다.
 *
 * 의존성이 없다. 화면도 서버도 검증 스크립트도 같은 파일을 본다 — 같은 규칙을
 * 두 곳에 적으면 반드시 갈라진다(ADMIN_NOISE에서 한 번 겪었다).
 */

export type Verdict = "block" | "review" | "pass";

export interface Screened {
  verdict: Verdict;
  /** 걸린 말. 화면에 보여줄 때는 거부 사유로만 쓰고 목록을 노출하지 않는다 */
  hit?: string;
  /** 어느 갈래에 걸렸나 (운영 화면에서 왜 보류됐는지 보여준다) */
  group?: string;
}

/* ---------- 우회 표기 펴기 ---------- */

/**
 * 같은 말을 여러 모양으로 쓴다. "시1발", "씨  발", "씨이이발"이 다 같은 말이다.
 * 원문 하나만 보면 한 글자만 바꿔도 빠져나가므로 몇 가지 모양으로 펴서 본다.
 *
 * 낱자음 우회(ㅅㅂ)는 여기서 다루지 않는다. 이름에 쓸 수 있는 글자가
 * `가-힣`·영문·숫자·공백뿐이라(lib/naming.ts) 낱자음은 접수 단계에서 이미 막힌다.
 *
 * **숫자를 통째로 지우지 않는다.** 처음에 그렇게 했더니 "자이2단지"가
 * "자이단지"가 되면서 "이단"에 걸렸다. 지우는 대신, 사전 낱말을 찾을 때
 * 글자 사이에 숫자가 끼어도 되는 것으로 본다(아래 pattern).
 */
function variants(raw: string): string[] {
  const bare = raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
  return [...new Set([bare, dropStretch(bare)])];
}

/**
 * 늘여 쓴 글자를 되돌린다. "씨이이발" → "씨발".
 *
 * 받침 없는 "ㅇ+모음" 음절이 바로 앞 음절과 모음이 같으면 늘여 쓴 것으로 본다.
 * 조건을 이만큼 좁힌 이유는 멀쩡한 이름을 건드리지 않기 위해서다 — "가야동"은
 * 가(ㅏ)와 야(ㅑ)의 모음이 다르고, "래미안"의 "안"은 받침이 있어 그대로 남는다.
 */
function dropStretch(s: string): string {
  const BASE = 0xac00;
  const CHO_IEUNG = 11; // 'ㅇ'
  let out = "";
  let prevJung = -1;
  for (const ch of s) {
    const code = ch.charCodeAt(0) - BASE;
    if (code < 0 || code > 11171) {
      out += ch;
      prevJung = -1;
      continue;
    }
    const cho = Math.floor(code / 588);
    const jung = Math.floor((code % 588) / 28);
    const jong = code % 28;
    if (cho === CHO_IEUNG && jong === 0 && jung === prevJung) continue; // 늘여 쓴 글자
    out += ch;
    prevJung = jung;
  }
  return out;
}

/**
 * 사전 낱말 하나를 찾는 정규식.
 * 글자 사이에 숫자나 공백이 끼어도 같은 말로 본다 ("시1발", "시 발").
 */
function pattern(word: string): RegExp {
  const chars = [...word.replace(/\s+/g, "")].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(chars.join("[0-9]*"));
}

/* ---------- 사전 ---------- */

/**
 * 접수를 막는 말. 욕설·성적 표현·집단 비하처럼 맥락을 따질 것 없이 안 되는 것들.
 * 두 글자 미만은 넣지 않는다 — 짧은 말은 멀쩡한 단지명 안에 우연히 들어간다.
 */
const BLOCK: Record<string, string[]> = {
  욕설: [
    "씨발", "시발", "씨팔", "시팔", "쉬발", "씨빨", "시빨", "씨발놈", "씨발년",
    "씨바알", "시바알", "씨바라", "시부럴", "씨부랄", "개씨발",
    "개새끼", "개색기", "개세끼", "개쉐끼", "쌍놈", "쌍년", "썅놈", "썅년",
    "좆같", "좆물", "좇같", "존나", "존내", "죽여버", "때려죽",
    "병신", "븅신", "빙신", "벙신", "등신같",
    "지랄", "지럴", "엿먹", "니미", "니애미", "니애비", "애미뒤", "후레자식",
  ],
  성적: [
    "섹스", "자위행위", "정액", "음경", "보지털", "자지털",
    "강간", "성폭행", "성추행", "몰카", "불법촬영", "성매매", "매춘", "창녀",
    "변태새끼", "발정", "음란",
  ],
  집단비하: [
    "틀딱", "틀딲", "급식충", "맘충", "한남충", "김치녀", "된장녀", "김여사",
    "메갈", "워마드", "일베충", "홍어", "과메기",
    "짱깨", "짱개", "쪽바리", "쪽발이", "왜놈", "떼놈", "때놈",
    "흑형", "깜둥이", "검둥이", "니그로",
    "앉은뱅이", "벙어리", "귀머거리", "절름발이", "정신병자", "미친놈", "미친년",
    "장애인새끼", "호모새끼",
  ],
  영문욕설: [
    "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "pussy", "whore",
    "slut", "retard", "nigger", "nigga", "dickhead", "motherfuck",
  ],
};

/**
 * 사람이 보고 정할 말. 그 자체로는 막을 일이 아니지만, 아파트 이름에 붙으면
 * 놀림이나 비하로 읽힐 수 있는 것들. 접수는 되고 대기로 간다.
 *
 * 여기 넣을지 말지의 기준: "이 말이 든 이름을 그냥 출제해도 마음이 편한가".
 * 조금이라도 걸리면 넣는다 — 자동으로 나가는 것보다 한 번 보는 쪽이 낫다.
 */
const REVIEW: Record<string, string[]> = {
  계층비하: [
    "촌동네", "달동네", "빈민", "휴거", "주공충", "빌거", "흙수저", "금수저",
    "거지같", "거지굴", "판자촌", "쪽방", "노숙",
  ],
  죽음재난: [
    "죽음", "시체", "시신", "무덤", "묘지", "자살", "살인", "폭력", "지옥",
    "저승", "유령", "귀신", "저주", "관짝", "영안실", "화장터", "납골", "곡소리",
  ],
  붕괴부실: [
    "붕괴", "부실공사", "철거", "폐허", "침수", "화재", "균열", "누수",
    "순살", "곰팡이", "석면", "라돈",
  ],
  돈문제: [
    "사기", "대출", "빚더미", "파산", "깡통", "미분양", "폭락", "떴다방",
    // "경매"만 넣었더니 경북 문경의 "문경매봉2"가 걸렸다. 지명과 겹치는
    // 두 글자는 더 또렷한 말로 바꾼다
    "부동산경매", "경매낙찰", "경매물건",
    "전세사기", "역전세", "영끌",
  ],
  질병: ["코로나", "전염", "바이러스", "역병", "흑사병", "결핵", "암덩"],
  정치종교: [
    "공산", "사회주의", "주체사상", "김정은", "대통령", "국회의원",
    "하나님", "예수님", "부처님", "알라", "사이비",
  ],
  유흥중독: [
    "룸살롱", "안마방", "유흥", "도박", "카지노", "마약", "대마", "필로폰",
    "술주정", "알콜중독",
  ],
  약한욕설: [
    "졸라", "병맛", "새끼", "미친", "바보", "멍청", "닥쳐", "꺼져", "빡침",
    "개같", "개판", "찌질", "한심",
  ],
  차별경계: ["조선족", "다문화", "외노자", "화교촌"],
  감금: ["감옥", "교도소", "수용소", "정신병원", "격리"],
};

/* ---------- 판정 ---------- */

/** 정규식은 한 번만 만든다. 이름 하나 볼 때마다 다시 만들면 검증에서 느려진다 */
function compile(dict: Record<string, string[]>): { re: RegExp; hit: string; group: string }[] {
  return Object.entries(dict).flatMap(([group, words]) =>
    words.map((w) => ({ re: pattern(w), hit: w, group })),
  );
}
const BLOCK_RE = compile(BLOCK);
const REVIEW_RE = compile(REVIEW);

function find(
  rules: { re: RegExp; hit: string; group: string }[],
  forms: string[],
): { hit: string; group: string } | null {
  for (const r of rules) {
    if (forms.some((f) => r.re.test(f))) return { hit: r.hit, group: r.group };
  }
  return null;
}

/**
 * 이름을 세 갈래로 가른다.
 * 거부가 보류보다 먼저다 — 둘 다 걸리면 막는 쪽을 쓴다.
 */
export function screenName(name: string): Screened {
  const forms = variants(name);
  const blocked = find(BLOCK_RE, forms);
  if (blocked) return { verdict: "block", hit: blocked.hit, group: blocked.group };
  const held = find(REVIEW_RE, forms);
  if (held) return { verdict: "review", hit: held.hit, group: held.group };
  return { verdict: "pass" };
}

/** 접수를 막을 때 보여줄 말. 어떤 낱말에 걸렸는지는 알려주지 않는다 —
 *  알려 주면 그 낱말만 비켜 가며 다시 시도하는 길잡이가 된다 */
export const BLOCK_MESSAGE = "이 이름에는 쓸 수 없는 말이 들어 있습니다";
