import type { Metadata } from "next";
import { requireReleased } from "@/lib/guard";

export const metadata: Metadata = {
  title: "작명소 · 아파트 감별사",
  description: "가짜 단지명을 직접 지어 감별 창구에 올립니다.",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  // 전개 전 창구는 주소를 알아도 안 열린다 (lib/release.ts)
  await requireReleased("naming");
  return children;
}
