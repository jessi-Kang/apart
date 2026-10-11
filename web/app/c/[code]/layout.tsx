import { requireReleased } from "@/lib/guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // 도전장은 감별 O/X의 판이다. 창구가 안 열렸으면 도전장도 없는 페이지다
  await requireReleased("ox");
  return children;
}
