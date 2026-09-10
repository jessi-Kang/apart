import Link from "next/link";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { HomeStatus } from "@/components/HomeStatus";

export const dynamic = "force-dynamic";

/** 홈 = 접수 창구 목록 (docs/07 §1-1, 확정 시안 A) */
export default function HomePage() {
  const date = kstDateString();
  const ep = episodeNumber(date);
  const [, mm, dd] = date.split("-");

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          감별 민원은
          <br />이 창구에서 <em>접수</em>합니다
        </h2>
        <p className="date mono">
          제{ep}호 / {Number(mm)}월 {Number(dd)}일
        </p>
        <p className="note">
          실존 단지명은 공공데이터(K-apt) 기준.
          <br />
          가짜 이름은 AI가 지었습니다.
          <br />
          본편 문제는 매일 자정에 바뀝니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <div className="brand">
            아파트 감별사<small>감별 민원 접수 창구</small>
          </div>
          <div className="issue mono">
            #{ep}
            <br />
            {mm}.{dd}
          </div>
        </header>

        <section className="screen home">
          <h1>
            오늘 처리할
            <br />
            감별 민원을 <em>선택</em>하세요
          </h1>
          <p className="sub">진짜 아파트와 AI가 지은 이름을 가려내는 데일리 게임. 본편은 하루 한 번입니다.</p>

          <nav className="modes" aria-label="게임 목록">
            <Link className="mode" href="/play">
              <span className="no mono">1</span>
              <span>
                <span className="tt">
                  감별 O/X<span className="daily-badge">오늘의 본편</span>
                </span>
                <span className="dd">
                  오늘의 10문제 · <HomeStatus date={date} />
                </span>
              </span>
              <span className="go-ic">→</span>
            </Link>
            <Link className="mode" href="/assemble">
              <span className="no mono">2</span>
              <span>
                <span className="tt">이름 조립</span>
                <span className="dd">힌트 보고 실존 단지명 조립 · 매일 새 3문제</span>
              </span>
              <span className="go-ic">→</span>
            </Link>
            <Link className="mode" href="/yesterday">
              <span className="no mono">3</span>
              <span>
                <span className="tt">어제의 정답 대장</span>
                <span className="dd">어제 10문제 정답 열람 · 전국이 얼마나 속았나</span>
              </span>
              <span className="go-ic">→</span>
            </Link>
            <div className="mode lock">
              <span className="no mono">4</span>
              <span>
                <span className="tt">작명소 · 우리 동네</span>
                <span className="dd">2단계 개설 예정 창구</span>
              </span>
            </div>
          </nav>
        </section>

        <footer className="sheet-footer">
          <span>단지 정보 출처: 공공데이터포털 K-apt</span>
          <span className="mono">본편 갱신 00:00 KST</span>
        </footer>
      </main>
    </div>
  );
}
