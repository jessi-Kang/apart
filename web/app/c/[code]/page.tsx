import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SheetFooter } from "@/components/SheetFooter";
import { DocTitle, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { getChallenge, type Challenge } from "@/lib/challenge";
import { areaLabel } from "@/lib/data";
import { requireReleased } from "@/lib/guard";
import { gameByKey } from "@/lib/release";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ code: string }>;
}

const from = (ch: Challenge) => (ch.label ? `${ch.label} 님의 도전장` : "누군가 보낸 도전장");
const gameOf = (ch: Challenge) => gameByKey(ch.mode);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ch = await getChallenge((await params).code);
  if (!ch) return { title: { absolute: "아파트 감별사" } };
  // 미리보기 카드가 곧 도전장이다. 기록과 "깰 수 있는가"만 싣고 문제는 싣지 않는다
  const title = `${ch.target}문제 연속 정답, 넘을 수 있습니까?`;
  const description = `${from(ch)} · ${gameOf(ch)?.label ?? "감별 O/X"}, 같은 문제를 같은 순서로`;
  return {
    title: { absolute: `${title} · 아파트 감별사` },
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** 도전장 접수: 링크를 연 사람의 첫 화면. 무엇을 겨루는지만 보이고 나가는 문은 하나다 */
export default async function ChallengePage({ params }: Props) {
  const ch = await getChallenge((await params).code);
  if (!ch) notFound();
  // 전개 전 창구의 도전장은 그 창구처럼 없는 페이지다
  await requireReleased(ch.mode);
  const game = gameOf(ch);
  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          같은 이름,
          <br />
          같은 순서.
          <br />
          <em>한 번 틀리면 끝</em>
        </h2>
        <p className="note">보낸 사람이 끊기지 않고 맞힌 구간을 그대로 받습니다.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>도전장</small>
          </Link>
        </header>

        <section className="screen result">
          <DocTitle eyebrow="도전장" title={`${ch.target}문제 연속 정답을 넘으십시오`} />
          <StampHero name="접수 대기" />
          <VForm>
            <VRow label="보낸 사람">{ch.label || "익명"}</VRow>
            <VRow label="창구">
              {game?.label ?? "감별 O/X"} {ch.area && <small>{areaLabel(ch.area)}</small>}
            </VRow>
            <VRow label="넘을 기록">
              <span className="accent">{ch.target}문제</span> 연속 정답
            </VRow>
            <VRow label="규칙">
              <small>보낸 사람이 받은 문제가 같은 순서로 나옵니다. 처음 틀리는 문제에서 끝납니다.</small>
            </VRow>
          </VForm>
          <div className="cut" />
          <div className="result-actions">
            <Link className="btn btn-next full" href={`${game?.href ?? "/o"}?c=${ch.code}`}>
              도전 접수
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
