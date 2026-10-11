"use client";

import { useEffect, useState } from "react";

/** 서비스를 연 해. 저작권 표기는 여기서 시작해 올해까지 이어진다 */
const SINCE = 2026;

/** 올해(KST). UTC로 재면 1월 1일 아침 9시까지 지난해로 나온다 */
function yearKst(): number {
  return new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
}

const label = (y: number) => (y > SINCE ? `${SINCE}–${y}` : String(SINCE));

/**
 * 저작권 연도.
 *
 * 처음에는 "© 2026"이 숫자로 박혀 있어 해가 바뀌어도 그대로 남을 참이었다.
 * 서버에서만 계산해도 모자란다 — /me·/top·/bug는 빌드 때 미리 만들어 두는
 * 페이지라 연도가 빌드한 날로 굳고, 새해 뒤에 배포가 없으면 지난해로 남는다.
 * 그래서 서버 값으로 먼저 그리고 브라우저에서 한 번 더 맞춘다.
 */
export function FooterYear() {
  const [year, setYear] = useState(() => yearKst());
  useEffect(() => setYear(yearKst()), []);
  return <>{label(year)}</>;
}
