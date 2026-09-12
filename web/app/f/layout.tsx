import type { Metadata } from "next";
import { requireReleased } from "@/lib/guard";

/** 화면 제목은 클라이언트 컴포넌트에서 못 내보내므로 레이아웃에 둔다.
    링크를 붙였을 때 어느 화면인지 제목만 봐도 알게 한다 */
export const metadata: Metadata = {
  title: "진짜 찾기",
  description: "넷 중 진짜 단지명 하나를 고릅니다.",
  openGraph: { title: "진짜 찾기 · 아파트 감별사", description: "넷 중 진짜 단지명 하나를 고릅니다." },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  // 전개 전 창구는 주소로도 못 들어온다 — 홈에서 숨기는 것만으로는 안 막힌다
  await requireReleased("findreal");
  return children;
}
