import type { Metadata } from "next";

/** 화면 제목은 클라이언트 컴포넌트에서 못 내보내므로 레이아웃에 둔다.
    링크를 붙였을 때 어느 화면인지 제목만 봐도 알게 한다 */
export const metadata: Metadata = {
  title: "감별 O/X",
  description: "이름 하나를 보고 진짜인지 AI가 지은 것인지 가려냅니다.",
  openGraph: { title: "감별 O/X · 아파트 감별사", description: "이름 하나를 보고 진짜인지 AI가 지은 것인지 가려냅니다." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
