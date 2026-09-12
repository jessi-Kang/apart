import Link from "next/link";
import { kstDateString, episodeNumber } from "@/lib/daily";
import { regions } from "@/lib/data";
import { visibleGames, viewerIsOwner } from "@/lib/release";
import { DailyChop } from "@/components/LedgerStatus";
import { IdBadge } from "@/components/IdBadge";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { StampFilter } from "@/components/StampFilter";

export const dynamic = "force-dynamic";

/** 홈 = 접수 대장 (확정 시안 home2-a: 순번·창구·현황 3열 서식 + 현황 도장) */
export default async function HomePage() {
  const date = kstDateString();
  const ep = episodeNumber(date);
  // 전개 전 창구는 운영자에게만 실린다 (lib/release.ts)
  const games = await visibleGames();
  // 내부 화면은 주소를 알아도 운영자만 열리지만, 들어갈 길이 아예 없어서
  // 주소를 외워 치고 있었다. 대장 아래에 내부용 한 줄을 둔다. 문은 하나만
  // 둔다 — 운영 현황에서 감별 리포트로 건너간다
  const owner = await viewerIsOwner();
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
          진짜는 실존하는 단지, 가짜는 AI가 지은 이름입니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="form-head">
          <div className="form-title">
            <b>아파트 감별사</b>
            <small>감별 민원 접수 창구</small>
          </div>
          <div className="form-no">
            <span>제{ep}호</span>
            <span>
              {mm}.{dd}
            </span>
          </div>
        </header>

        <section className="screen home">
          {/* 접수 대장의 '성적표' 도장이 쓰는 변위 필터. 페이지당 한 번만 심는다 */}
          <StampFilter />
          <div className="home-seal" aria-hidden="true">
            <Seal size={216} />
          </div>
          <h1>
            오늘 처리할
            <br />
            감별 민원을 <em>선택</em>하세요
          </h1>
          <p className="sub">진짜 아파트와 AI가 지은 이름 가려내기</p>
          <IdBadge regions={regions} />

          <nav className="ledger" aria-label="게임 목록">
            <div className="ledger-head mono">
              <span>순번</span>
              <span>창구</span>
              <span>공식전</span>
            </div>
            {games.map((g, i) => (
              <div className="row" key={g.key}>
                <Link className="rmain" href={g.href}>
                  <span className="no mono">{i + 1}</span>
                  <span className="cell">
                    <span className="tt">
                      {g.label}
                      {/* 전개 전 창구는 운영자에게만 보인다. 보이는 김에 그 사실도 함께 */}
                      {!g.released && <em className="unreleased">비공개</em>}
                    </span>
                    <span className="dd">{g.desc}</span>
                    <span className="cell-go" aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 11 11">
                        <path d="M3.4 1.6L7.2 5.5 3.4 9.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </span>
                </Link>
                {/* 공식전 칸은 그 자체가 출전구다. 무한 중에 뜨는 작은 칩으로만 열어 두니
                    아무도 공식전을 찾지 못했다 */}
                <Link className="st" href={`${g.href}?official=1`}>
                  <DailyChop mode={g.key as "ox" | "assemble" | "findreal"} date={date} />
                </Link>
              </div>
            ))}
            <div className="row off">
              <span className="rmain">
                <span className="no mono">{games.length + 1}</span>
                <span className="cell">
                  <span className="tt">작명소</span>
                  <span className="dd">2단계 개설 예정 창구</span>
                </span>
              </span>
              <span className="st">
                <span className="chop off">미개설</span>
              </span>
            </div>
          </nav>
          <p className="ledger-note">
            창구 이름을 누르면 <b>무한</b>, 오른쪽 <b>출전하기</b>를 누르면 같은 구역끼리 겨루는{" "}
            <b>공식전</b>입니다.
          </p>
          {owner && (
            <p className="inhouse">
              <span className="inhouse-k mono">내부</span>
              <Link href="/ops">운영 현황 열람</Link>
            </p>
          )}
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
