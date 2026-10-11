import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SheetFooter } from "@/components/SheetFooter";
import { DocTitle, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { getChallenge, type Challenge } from "@/lib/challenge";
import { areaLabel } from "@/lib/data";
import { eulReul } from "@/lib/josa";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ code: string }>;
}

const from = (ch: Challenge) => (ch.label ? `${ch.label} 님의 도전장` : "누군가 보낸 도전장");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ch = await getChallenge((await params).code);
  if (!ch) return { title: { absolute: "아파트 감별사" } };
  // 미리보기 카드가 곧 도전장이다. 기록과 "깰 수 있는가"만 싣고 문제는 싣지 않는다
  const title = `연속 ${ch.target}${eulReul(ch.target)} 깨십시오`;
  const description = `${from(ch)} · 감별 O/X, 같은 문제를 같은 순서로`;
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
          <DocTitle eyebrow="도전장" title={`연속 ${ch.target}${eulReul(ch.target)} 깨십시오`} />
          <StampHero name="접수 대기" />
          <VForm>
            <VRow label="보낸 사람">{ch.label || "익명"}</VRow>
            <VRow label="창구">
              감별 O/X {ch.area && <small>{areaLabel(ch.area)}</small>}
            </VRow>
            <VRow label="넘을 기록">
              연속 <span className="accent">{ch.target}</span>
            </VRow>
            <VRow label="규칙">
              <small>보낸 사람이 받은 이름이 같은 순서로 나옵니다. 처음 틀리는 문제에서 끝납니다.</small>
            </VRow>
          </VForm>
          <div className="cut" />
          <div className="result-actions">
            <Link className="btn btn-next full" href={`/o?c=${ch.code}`}>
              도전 접수
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
