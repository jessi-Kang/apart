import type { Metadata } from "next";

/** 화면 제목은 클라이언트 컴포넌트에서 못 내보내므로 레이아웃에 둔다.
    링크를 붙였을 때 어느 화면인지 제목만 봐도 알게 한다 */
export const metadata: Metadata = {
  title: "구역 명부",
  description: "같은 담당 구역 감별사들의 직급 순위.",
  openGraph: { title: "구역 명부 · 아파트 감별사", description: "같은 담당 구역 감별사들의 직급 순위." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
