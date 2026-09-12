import { regions } from "@/lib/data";
import { NamingForm } from "@/components/NamingForm";

export const dynamic = "force-dynamic";

/** 작명소. 구역 목록은 서버에서 넘긴다 — 이것 하나 때문에 API를 새로 열지 않는다 */
export default function NamingPage() {
  return <NamingForm regions={regions} />;
}
