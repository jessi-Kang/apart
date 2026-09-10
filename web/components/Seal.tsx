/** 관인(官印) — 접수 창구의 공식 도장 (시안 A 세계관 에셋, svg-creator 제작)
 * 파비콘(icon.svg)과 같은 아파트 글리프를 중앙에 쓴다. 장식 요소라 aria-hidden. */
export function Seal({ size = 104 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="seal-rough" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
        </filter>
        <path id="seal-ring-top" d="M100,100 m-72,0 a72,72 0 1,1 144,0" fill="none" />
        <path id="seal-ring-bot" d="M100,100 m-72,0 a72,72 0 1,0 144,0" fill="none" />
      </defs>
      <g filter="url(#seal-rough)" fill="none" stroke="var(--stamp)">
        <circle cx="100" cy="100" r="92" strokeWidth="5" />
        <circle cx="100" cy="100" r="84" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="52" strokeWidth="1.6" />
      </g>
      <g filter="url(#seal-rough)" fill="var(--stamp)">
        <text fontSize="17.5" fontWeight="700" letterSpacing="3.5">
          <textPath href="#seal-ring-top" startOffset="50%" textAnchor="middle">
            아파트 감별사
          </textPath>
        </text>
        <text fontSize="15" fontWeight="700" letterSpacing="2.5">
          <textPath href="#seal-ring-bot" startOffset="50%" textAnchor="middle">
            감별민원 접수처
          </textPath>
        </text>
        <circle cx="28" cy="100" r="3" />
        <circle cx="172" cy="100" r="3" />
        <rect x="84" y="72" width="32" height="52" rx="2" />
        <rect x="92" y="65" width="16" height="7" rx="1.5" />
      </g>
      <g filter="url(#seal-rough)" fill="var(--sheet)">
        <rect x="89" y="79" width="8" height="7" rx="1" />
        <rect x="103" y="79" width="8" height="7" rx="1" />
        <rect x="89" y="91" width="8" height="7" rx="1" />
        <rect x="103" y="91" width="8" height="7" rx="1" />
        <rect x="89" y="103" width="8" height="7" rx="1" />
        <rect x="103" y="103" width="8" height="7" rx="1" />
        <rect x="96" y="114" width="8" height="10" rx="1" />
      </g>
    </svg>
  );
}
