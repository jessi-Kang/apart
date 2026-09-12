import type { Metadata } from "next";

/** 화면 제목은 클라이언트 컴포넌트에서 못 내보내므로 레이아웃에 둔다.
    링크를 붙였을 때 어느 화면인지 제목만 봐도 알게 한다 */
export const metadata: Metadata = {
  title: "기록 열람실",
  description: "지금까지 쌓은 감별 기록과 순위.",
  openGraph: { title: "기록 열람실 · 아파트 감별사", description: "지금까지 쌓은 감별 기록과 순위." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
