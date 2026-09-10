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
