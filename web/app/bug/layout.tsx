import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "버그 제보",
  description: "겪으신 문제를 알려 주세요.",
  openGraph: { title: "버그 제보 · 아파트 감별사", description: "겪으신 문제를 알려 주세요." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
