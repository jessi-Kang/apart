import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerIsOwner } from "@/lib/release";

export const metadata: Metadata = {
  title: "감별 리포트",
  description: "사람들이 가장 잘 속은 아파트 이름.",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  // 아직 전개 전이다. 못 보는 사람에게는 없는 페이지로 답한다
  if (!(await viewerIsOwner())) notFound();
  return children;
}
