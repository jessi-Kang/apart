import { regions } from "@/lib/data";
import { NamingForm } from "@/components/NamingForm";

export const dynamic = "force-dynamic";

/**
 * 작명소. 구역 목록은 서버에서 넘긴다 — 이것 하나 때문에 API를 새로 열지 않는다.
 * ?mine=1로 들어오면 접수 목록부터 편다(기록 열람실의 "전부 보기"가 이리로 온다).
 */
export default async function NamingPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const { mine } = await searchParams;
  return <NamingForm regions={regions} openMine={mine === "1"} />;
}
