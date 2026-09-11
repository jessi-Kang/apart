import type { ReactNode } from "react";
import { GridTile } from "./GridTile";
import { Stamp } from "./Stamp";

/**
 * 결과 화면 확정 시안 R1 "판정 통지서"의 조립 부품.
 * 등급 도장이 주인공, 수치는 순번 괘선 서식표에 정리된다.
 */

export function DocTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <p className="doc-title">
      {eyebrow}
      <b>{title}</b>
    </p>
  );
}

export function StampHero({ name }: { name: string }) {
  return (
    <div className="stamp-hero">
      <Stamp>{name}</Stamp>
    </div>
  );
}

export function VForm({ children }: { children: ReactNode }) {
  return <div className="vform">{children}</div>;
}

export function VRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="vrow">
      <span className="vk">{label}</span>
      <span className="vv">{children}</span>
    </div>
  );
}

/** 서식 칸 안에 들어가는 작은 판정 그리드 */
export function MiniGrid({ marks, label }: { marks: boolean[]; label: string }) {
  return (
    <span className="mini-grid" role="img" aria-label={label}>
      {marks.map((m, k) => (
        <span key={k} className="tile-in" style={{ animationDelay: `${k * 45}ms` }}>
          <GridTile ok={m} />
        </span>
      ))}
    </span>
  );
}
