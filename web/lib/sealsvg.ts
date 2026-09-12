/**
 * 관인(官印) SVG 문자열.
 *
 * 화면용 Seal 컴포넌트와 같은 도형인데, 색을 CSS 변수가 아니라 값으로 박았다.
 * 공유 카드(캔버스)와 링크 미리보기 카드(ImageResponse)는 CSS 변수를 모른다.
 *
 * 링 텍스트는 글자별 고정 각도 배치다. textPath는 폰트 메트릭에 따라 글자가
 * 링을 뚫고 나가서 쓰지 않는다(화면 컴포넌트와 같은 이유).
 */

const STAMP = "#c73a2f";
const SHEET = "#fdfdfb";
const RING_R = 68;

function ringText(text: string, top: boolean, size: number): string {
  const chars = [...text.replace(/\s/g, "")];
  const step = 21;
  const total = step * (chars.length - 1);
  return chars
    .map((ch, i) => {
      const a = top ? -total / 2 + step * i : total / 2 - step * i;
      return `<text transform="rotate(${a}) translate(0 ${top ? -RING_R : RING_R})" dominant-baseline="central">${ch}</text>`;
    })
    .join("");
}

/**
 * @param withText 링 글자를 넣을지. 글자를 그리려면 그리는 쪽에 한글 폰트가
 *   있어야 한다 — 없으면 네모로 나오므로 도형만 쓰는 쪽이 안전하다.
 */
export function sealSvg(withText = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <filter id="sr" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/>
  </filter>
  <g filter="url(#sr)">
    <g fill="none" stroke="${STAMP}">
      <circle cx="100" cy="100" r="92" stroke-width="5"/>
      <circle cx="100" cy="100" r="84" stroke-width="1.6"/>
      <circle cx="100" cy="100" r="52" stroke-width="1.6"/>
    </g>
    <g fill="${STAMP}">
      <circle cx="28" cy="100" r="3"/>
      <circle cx="172" cy="100" r="3"/>
      <rect x="84" y="72" width="32" height="52" rx="2"/>
      <rect x="92" y="65" width="16" height="7" rx="1.5"/>
    </g>
    <g fill="${SHEET}">
      <rect x="89" y="79" width="8" height="7" rx="1"/>
      <rect x="103" y="79" width="8" height="7" rx="1"/>
      <rect x="89" y="91" width="8" height="7" rx="1"/>
      <rect x="103" y="91" width="8" height="7" rx="1"/>
      <rect x="89" y="103" width="8" height="7" rx="1"/>
      <rect x="103" y="103" width="8" height="7" rx="1"/>
      <rect x="96" y="114" width="8" height="10" rx="1"/>
    </g>
  </g>${
    withText
      ? `
  <g transform="translate(100 100)" fill="${STAMP}" font-weight="700" text-anchor="middle">
    <g font-size="16">${ringText("아파트 감별사", true, 16)}</g>
    <g font-size="14">${ringText("감별민원 접수처", false, 14)}</g>
  </g>`
      : ""
  }
</svg>`;
}

/** data: URI로 감싼 관인 (img 태그에 바로 넣는다) */
export function sealDataUri(withText = false): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sealSvg(withText))}`;
}
