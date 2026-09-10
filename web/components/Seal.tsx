/** 관인(官印) — 접수 창구의 공식 도장 (시안 A 세계관 에셋, svg-creator 제작)
 * 파비콘(icon.svg)과 같은 아파트 글리프를 중앙에 쓴다. 장식 요소라 aria-hidden.
 * 링 텍스트는 textPath 대신 글자별 고정 각도 배치 — textPath는 기기 폰트
 * 메트릭에 따라 글자가 링을 뚫고 나가서(모바일 실기기 확인) 쓰지 않는다. */

const RING_R = 68; // 텍스트 밴드 중심 반지름 (안 52 ~ 밖 84의 정중앙)

function RingText({ text, top, size }: { text: string; top: boolean; size: number }) {
  const chars = [...text.replace(/\s/g, "")];
  const step = 21; // 글자 간 각도(도) — 폰트와 무관하게 고정
  const total = step * (chars.length - 1);
  return (
    <g fontSize={size} fontWeight={700} textAnchor="middle">
      {chars.map((ch, i) => {
        // 위쪽: 상단 중심에서 좌→우 / 아래쪽: 하단 중심에서 좌→우(각도 역순, 플립 없음)
        const a = top ? -total / 2 + step * i : total / 2 - step * i;
        return (
          <text
            key={i}
            transform={`rotate(${a}) translate(0 ${top ? -RING_R : RING_R})`}
            dominantBaseline="central"
          >
            {ch}
          </text>
        );
      })}
    </g>
  );
}

export function Seal({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <filter id="seal-rough" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
        </filter>
      </defs>
      {/* 거칠기 필터는 도형(원·글리프)에만 건다 — 모바일 GPU에서 텍스트에
          displacement 필터를 걸면 글자가 깨지는 사례가 있어 텍스트는 무필터 */}
      <g filter="url(#seal-rough)">
        <g fill="none" stroke="var(--stamp)">
          <circle cx="100" cy="100" r="92" strokeWidth="5" />
          <circle cx="100" cy="100" r="84" strokeWidth="1.6" />
          <circle cx="100" cy="100" r="52" strokeWidth="1.6" />
        </g>
        <g fill="var(--stamp)">
          <circle cx="28" cy="100" r="3" />
          <circle cx="172" cy="100" r="3" />
          <rect x="84" y="72" width="32" height="52" rx="2" />
          <rect x="92" y="65" width="16" height="7" rx="1.5" />
        </g>
        <g fill="var(--sheet)">
          <rect x="89" y="79" width="8" height="7" rx="1" />
          <rect x="103" y="79" width="8" height="7" rx="1" />
          <rect x="89" y="91" width="8" height="7" rx="1" />
          <rect x="103" y="91" width="8" height="7" rx="1" />
          <rect x="89" y="103" width="8" height="7" rx="1" />
          <rect x="103" y="103" width="8" height="7" rx="1" />
          <rect x="96" y="114" width="8" height="10" rx="1" />
        </g>
      </g>
      <g transform="translate(100 100)" fill="var(--stamp)">
        <RingText text="아파트 감별사" top size={16} />
        <RingText text="감별민원 접수처" top={false} size={14} />
      </g>
    </svg>
  );
}
