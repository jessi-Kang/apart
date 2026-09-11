export interface Grade {
  min: number;
  name: string;
  desc: string;
}

/** 등급 (docs/02 §3). 주거 형태·주거 불안정 소재 금지 정책 준수. */
export const GRADES: Grade[] = [
  { min: 0, name: "외지인", desc: "아파트 이름이 다 그게 그거 같죠? 정상입니다. 내일 다시 접수하세요." },
  { min: 4, name: "모델하우스 구경러", desc: "발품은 팔아봤는데, 이름까진 안 외웠군요. 감은 있습니다." },
  { min: 7, name: "부동산 카페 눈팅러", desc: "매일 눈팅한 짬은 못 속입니다. 상위권 감별력." },
  { min: 9, name: "시어머니도 못 찾는 이름 감별사", desc: "이름만 봐도 평면도가 보이는 수준. 최고 등급입니다." },
];

export function gradeFor(score: number): Grade {
  return [...GRADES].reverse().find((g) => score >= g.min) ?? GRADES[0];
}

/** 이름 조립 등급 (10문제 기준). 건설 현장 콘셉트 */
export const ASSEMBLE_GRADES: Grade[] = [
  { min: 0, name: "함정 조각 수집가", desc: "미끼 조각만 골라 담았습니다. 안목은 내일부터." },
  { min: 4, name: "견습 조립공", desc: "손은 풀렸습니다. 함정만 거르면 승급입니다." },
  { min: 7, name: "현장 반장", desc: "도면 없이도 척척. 현장이 믿는 실력입니다." },
  { min: 10, name: "설계도 없는 건축사", desc: "이름 조각만 보고 단지를 세우는 경지. 만점입니다." },
];

export function assembleGradeFor(success: number): Grade {
  return [...ASSEMBLE_GRADES].reverse().find((g) => success >= g.min) ?? ASSEMBLE_GRADES[0];
}

/** 진짜 찾기 등급 (10라운드 기준). 눈썰미 콘셉트 */
export const FIND_GRADES: Grade[] = [
  { min: 0, name: "AI의 단골 손님", desc: "가짜가 지은 이름에 열 번 초대받았습니다. 설욕 필수." },
  { min: 4, name: "모델하우스 단골", desc: "반은 가려냅니다. 진짜의 냄새를 알기 시작했군요." },
  { min: 7, name: "공인중개사 뺨치는 눈", desc: "등기부 없이도 진짜를 짚어냅니다. 상위권." },
  { min: 10, name: "부동산 매의 눈", desc: "열 번 다 진짜만 짚었습니다. 매도 울고 갑니다." },
];

export function findGradeFor(hits: number): Grade {
  return [...FIND_GRADES].reverse().find((g) => hits >= g.min) ?? FIND_GRADES[0];
}
