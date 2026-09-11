import type { ReactNode } from "react";

/**
 * 등급 도장 프레임. CSS 직선 테두리 대신 feTurbulence 변위로 테두리를 미세하게
 * 일그러뜨려 실제로 찍힌 도장처럼 보이게 한다 (디자인 A "접수 서류" 세계관).
 *
 * 테두리를 SVG 사각형으로 그리지 않고 CSS 테두리로 그리는 이유:
 * 전에는 240x72 viewBox를 preserveAspectRatio="none"으로 문구 폭에 맞춰 늘였는데,
 * 그러면 가로·세로 배율이 갈려 선 굵기까지 갈린다. "감별 수련"처럼 짧은 문구에서
 * 실측 배율이 X 0.54 / Y 0.84라 좌우 선은 2.4px, 위아래 선은 3.8px로 나왔다
 * (좌우만 얇아 보인 정체). vector-effect="non-scaling-stroke"로는 못 고친다 —
 * 필터를 먹은 그룹 안에서는 그 속성이 무시된다(고쳐 보고 실측해서 확인했다).
 * CSS 테두리는 늘어나도 굵기가 그대로라 애초에 갈릴 일이 없고, 변위 필터는
 * 그 상자에 그대로 걸 수 있다.
 */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="stamp">
      <svg className="stamp-filter" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="stamp-rough" x="-12%" y="-20%" width="124%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.07" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
        </filter>
      </svg>
      <span className="stamp-frame" aria-hidden="true" />
      <span className="stamp-text">{children}</span>
    </span>
  );
}
