import { regions } from "@/lib/data";
import { authConfigured, readSession } from "@/lib/auth";
import { NamingForm } from "@/components/NamingForm";

export const dynamic = "force-dynamic";

/**
 * 작명소. 구역 목록은 서버에서 넘긴다 — 이것 하나 때문에 API를 새로 열지 않는다.
 * ?mine=1로 들어오면 접수 목록부터 편다(기록 열람실의 "전부 보기"가 이리로 온다).
 *
 * 로그인 여부도 서버에서 넘긴다. 조각을 다 눌러 이름을 지어 놓고 마지막에
 * "로그인하세요"를 만나면 그때까지 한 일이 통째로 날아간다 — 첫 화면에서
 * 말해야 한다.
 */
export default async function NamingPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const { mine } = await searchParams;
  const session = await readSession();
  return (
    <NamingForm
      regions={regions}
      openMine={mine === "1"}
      signedIn={Boolean(session?.uid)}
      canLogIn={authConfigured()}
    />
  );
}
