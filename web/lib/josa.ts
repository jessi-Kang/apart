/** 숫자 뒤 목적격 조사. 12 → "를"(십이를), 13 → "을"(십삼을). 서버·화면 공용 */
export function eulReul(n: number): string {
  const d = Math.abs(n) % 10;
  return d === 2 || d === 4 || d === 5 || d === 9 ? "를" : "을";
}

/** 숫자 뒤 "(으)로". 14 → "로"(십사로), 13 → "으로"(십삼으로). ㄹ받침(1·7·8)은 "로" */
export function euroRo(n: number): string {
  const d = Math.abs(n) % 10;
  return d === 0 || d === 3 || d === 6 ? "으로" : "로";
}
