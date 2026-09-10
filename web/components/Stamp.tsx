import type { ReactNode } from "react";

/**
 * 등급 도장 프레임. CSS 직선 테두리 대신 feTurbulence 변위로 테두리를 미세하게
 * 일그러뜨려 실제로 찍힌 도장처럼 보이게 한다 (디자인 A "접수 서류" 세계관).
 * 프레임 SVG는 preserveAspectRatio="none"으로 내용 크기에 맞춰 늘어난다.
 */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="stamp">
      <svg className="stamp-frame" viewBox="0 0 240 72" preserveAspectRatio="none" aria-hidden="true">
        <filter id="stamp-rough" x="-10%" y="-18%" width="120%" height="136%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08 0.12" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
        </filter>
        <g filter="url(#stamp-rough)">
          <rect x="4" y="4" width="232" height="64" fill="none" stroke="currentColor" strokeWidth="4.5" />
          <rect x="11" y="11" width="218" height="50" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </g>
      </svg>
      <span className="stamp-text">{children}</span>
    </span>
  );
}
