import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerIsOwner } from "@/lib/release";

export const metadata: Metadata = {
  title: "운영 현황",
  description: "서비스가 돌아가는 모양.",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  // 운영자 전용. 못 보는 사람에게는 없는 페이지로 답한다
  if (!(await viewerIsOwner())) notFound();
  return children;
}
