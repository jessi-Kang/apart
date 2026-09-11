import Link from "next/link";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { DailyChop, FindTail, RecTail } from "@/components/LedgerStatus";
import { IdBadge } from "@/components/IdBadge";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";

export const dynamic = "force-dynamic";

/** 홈 = 접수 대장 (확정 시안 home2-a: 순번·창구·현황 3열 서식 + 현황 도장) */
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
          진짜는 실존하는 단지,
          <br />
          가짜는 AI가 지은 이름입니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="form-head">
          <div className="form-title">
            <b>아파트 감별사</b>
            <small>감별 민원 접수 창구</small>
          </div>
          <div className="form-no">
            <span>#{ep}</span>
            <span>
              {mm}.{dd}
            </span>
          </div>
        </header>

        <section className="screen home">
          <div className="home-seal" aria-hidden="true">
            <Seal size={216} />
          </div>
          <h1>
            오늘 처리할
            <br />
            감별 민원을 <em>선택</em>하세요
          </h1>
          <p className="sub">진짜 아파트와 AI가 지은 이름을 가려내는 감별{" "}게임</p>
          <IdBadge />

          <nav className="ledger" aria-label="게임 목록">
            <div className="ledger-head mono">
              <span>순번</span>
              <span>창구</span>
              <span>공식전</span>
            </div>
            <Link className="row" href="/play">
              <span className="no mono">1</span>
              <span className="cell">
                <span className="tt">감별 O/X</span>
                <span className="dd">이름 하나를 보고 진짜/가짜</span>
                <span className="dd-rec">
                  <RecTail mode="ox" />
                </span>
              </span>
              <span className="st">
                <DailyChop mode="ox" date={date} />
              </span>
            </Link>
            <Link className="row" href="/assemble">
              <span className="no mono">2</span>
              <span className="cell">
                <span className="tt">이름 조립</span>
                <span className="dd">힌트로 단지명 조립</span>
                <span className="dd-rec">
                  <RecTail mode="assemble" />
                </span>
              </span>
              <span className="st">
                <DailyChop mode="assemble" date={date} />
              </span>
            </Link>
            <Link className="row" href="/findreal">
              <span className="no mono">3</span>
              <span className="cell">
                <span className="tt">진짜 찾기</span>
                <span className="dd">넷 중 진짜는 하나</span>
                <span className="dd-rec">
                  <FindTail />
                </span>
              </span>
              <span className="st">
                <DailyChop mode="findreal" date={date} />
              </span>
            </Link>
            <div className="row off">
              <span className="no mono">4</span>
              <span className="cell">
                <span className="tt">작명소 · 우리 동네</span>
                <span className="dd">2단계 개설 예정 창구</span>
              </span>
              <span className="st">
                <span className="chop off">미개설</span>
              </span>
            </div>
          </nav>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
