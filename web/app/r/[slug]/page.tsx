import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GridTile } from "@/components/GridTile";
import { Stamp } from "@/components/Stamp";
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
  if (!r) return { title: "아파트 감별사" };
  const grade = gradeFor(r.score);
  const title = `아파트 감별사 #${episodeNumber(r.date)} · ${r.score}/10 ${grade.name}`;
  return {
    title,
    description: "이거 진짜 있는 아파트야, AI가 지어낸 거야? 하루 10문제 데일리 퀴즈",
    openGraph: { title },
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
          <p className="score-label mono">
            제{ep}회 감별 결과
          </p>
          <p className="big">{r.score} / 10</p>
          <Stamp>{grade.name}</Stamp>
          <p className="grade-desc">{grade.desc}</p>
          <div className="grid-line" role="img" aria-label={`10문제 중 ${r.score}문제 정답`}>
            {r.marks.map((m, k) => (
              <span key={k} className="tile-in" style={{ animationDelay: `${k * 55}ms` }}>
                <GridTile ok={m} />
              </span>
            ))}
          </div>
          <div className="result-actions">
            <Link className="btn btn-next" href="/play">
              나도 오늘 문제 감별하기
            </Link>
            <Link className="btn btn-ghost" href="/yesterday">
              어제 문제 정답 보기
            </Link>
          </div>
        </section>

        <footer className="sheet-footer">
          <span>하루 10문제 · 매일 자정 갱신</span>
          <span className="mono">apt-gam</span>
          <span className="copyright">
            © 2026 아파트 감별사 · <a href="mailto:jihyun.kang@me.com">jihyun.kang@me.com</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
