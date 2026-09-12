import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { DocTitle, MiniGrid, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { episodeNumber } from "@/lib/daily";
import { gradeFor } from "@/lib/grades";
import { parseSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = parseSlug(slug);
  if (!r) return { title: { absolute: "아파트 감별사" } };
  const grade = gradeFor(r.score);
  // 제목에 이미 서비스 이름이 들어 있으므로 absolute로 둔다.
  // 그냥 두면 루트 템플릿이 붙어 "… · 아파트 감별사 · 아파트 감별사"가 된다
  const title = `아파트 감별사 #${episodeNumber(r.date)} · ${r.score}/10 ${grade.name}`;
  const description = `10문제 중 ${r.score}문제 적중. 당신도 진짜 아파트와 AI가 지은 이름을 가려낼 수 있나요?`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** 공유 결과 페이지: 점수·등급을 보여주고 오늘 문제로 유도한다 */
export default async function ResultPage({ params }: Props) {
  const { slug } = await params;
  const r = parseSlug(slug);
  if (!r) notFound();
  const grade = gradeFor(r.score);
  const ep = episodeNumber(r.date);
  const [, mm, dd] = r.date.split("-");

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          누군가의
          <br />
          감별 결과 <em>통지서</em>입니다
        </h2>
        <p className="note">
          같은 문제는 하루 동안만 열립니다.
          <br />
          당신의 감별력도 시험해 보세요.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>감별 결과 통지서</small>
          </Link>
          <div className="issue mono">
            #{ep}
            <br />
            {mm}.{dd}
          </div>
        </header>

        <section className="screen result">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>
          <DocTitle eyebrow="감별결과통지" title={`제${ep}호 감별 결과`} />
          <StampHero name={grade.name} />
          <p className="stamp-sub">
            10문제 중 {r.score}문제 적중 · AI에 {10 - r.score}번 속았습니다
          </p>
          <VForm>
            <VRow label="판정">
              <MiniGrid marks={r.marks} label={`10문제 중 ${r.score}문제 정답`} />
            </VRow>
            <VRow label="접수 일자">
              {mm}월 {dd}일 <small>제{ep}호</small>
            </VRow>
          </VForm>
          <div className="cut" />
          <p className="rule-hint">
            창구에 들어가면 <b>무한 감별</b>이 바로 시작됩니다.
            <br />
            같은 문제로 겨루는 제{ep}호 공식전은 게임 안에서 신청할 수 있습니다.
          </p>
          <div className="result-actions">
            <Link className="btn btn-next" href="/o">
              나도 감별하기
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
