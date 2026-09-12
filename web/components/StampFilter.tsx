/**
 * 도장 테두리를 일그러뜨리는 변위 필터. 한 페이지에 한 번만 심고
 * CSS `filter: url(#stamp-rough)`로 여러 군데서 가져다 쓴다.
 *
 * 곧은 CSS 테두리를 그대로 두면 도장이 아니라 태그로 읽힌다. 실제로 찍힌
 * 도장은 인주가 고르게 묻지 않아 선이 끊기고 번진다 — 그 결함이 "찍혔다"는
 * 신호다. 두 종류를 두는 이유는 변위량이 절대 픽셀이라서다: 큰 등급 도장의
 * 흔들림을 작은 현황 도장에 그대로 쓰면 글자가 뭉개진다.
 */
export function StampFilter() {
  return (
    <svg className="stamp-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="stamp-rough" x="-12%" y="-20%" width="124%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05 0.07" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
      </filter>
      {/* 현황 도장처럼 작은 것 — 같은 결이되 흔들림은 절반 아래로 */}
      <filter id="stamp-rough-sm" x="-14%" y="-24%" width="128%" height="148%">
        <feTurbulence type="fractalNoise" baseFrequency="0.11 0.15" numOctaves="2" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" />
      </filter>
    </svg>
  );
}
