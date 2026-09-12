"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocTitle } from "@/components/VerdictForm";
import { GoogleMark } from "@/components/GoogleMark";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { areaPref, AREA_EVENT } from "@/lib/local";
import { titleFor, levelFromXp } from "@/lib/level";

interface Row {
  rank: number;
  name: string;
  xp: number;
  me: boolean;
}
interface Board {
  area: string;
  rows: Row[];
  total: number;
  mine: Row | null;
  signedIn: boolean;
}

const shortArea = (a: string) => a.replace(/특별자치시$|특별자치도$|특별시$|광역시$/, "") || "전국";

/**
 * 구역 명부: 같은 담당 구역 감별사들의 직급 순위.
 *
 * 남이 몇 점인지보다 "내가 어디쯤인가"가 먼저다. 그래서 내 줄은 두 번 나온다 —
 * 위쪽 요약에 한 번, 명부 안 제자리에 한 번. 첫 장(50명) 밖이면 아래에 따로
 * 붙여서, 순위가 한참 밑이어도 스크롤 없이 보인다.
 *
 * 구역끼리 비교하는 화면은 만들지 않는다. 같은 구역 안에서만 줄을 세운다.
 */
export default function RankingPage() {
  const [area, setArea] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const meRow = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const refresh = () => setArea(areaPref());
    refresh();
    window.addEventListener(AREA_EVENT, refresh);
    return () => window.removeEventListener(AREA_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (area === null) return;
    setBoard(null);
    setFailed(false);
    fetch(`/api/ranking${area ? `?area=${encodeURIComponent(area)}` : ""}`)
      .then((r) => r.json())
      .then((b: Board) => setBoard(b))
      .catch(() => setFailed(true));
  }, [area]);

  const jumpToMe = useCallback(() => {
    meRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const label = shortArea(area ?? "");
  const mine = board?.mine ?? null;
  const inFirstPage = Boolean(mine && board?.rows.some((r) => r.me));

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          같은 구역
          <br />
          감별사 <em>명부</em>입니다
        </h2>
        <p className="note">
          담당 구역이 같은 사람끼리 직급 순으로 실립니다. 이름은 일부만 보이고,
          구역끼리 견주는 표는 만들지 않습니다.
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>구역 명부</small>
          </Link>
          <Link className="close-x" href="/" aria-label="창구로 돌아가기">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </header>

        <section className="screen result">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>
          <DocTitle eyebrow="구역명부" title={`${label} 감별사 순위`} />

          {/* 내 자리를 맨 위에 한 번 더 박아 둔다 — 명부를 여는 이유가 이것이다 */}
          <div className="mycard">
            {mine ? (
              <>
                <span className="myk">내 순위</span>
                <b className="myrank mono">
                  {mine.rank}
                  <i>위</i>
                </b>
                <span className="mymeta">
                  {board!.total}명 중 · Lv.{levelFromXp(mine.xp).level} {titleFor(levelFromXp(mine.xp).level)}
                </span>
                {!inFirstPage && (
                  <button type="button" className="myjump" onClick={jumpToMe}>
                    내 줄 보기
                  </button>
                )}
              </>
            ) : board && !board.signedIn ? (
              <>
                <span className="myk">내 순위</span>
                <b className="myrank-off">명부에 없음</b>
                <span className="mymeta">기록을 계정에 보관하면 이름이 오릅니다</span>
                <a className="myjump" href="/api/auth/login">
                  <GoogleMark size={13} />
                  기록 보관
                </a>
              </>
            ) : !board ? (
              <>
                <span className="myk">내 순위</span>
                <b className="myrank-off">확인 중</b>
              </>
            ) : (
              <>
                <span className="myk">내 순위</span>
                <b className="myrank-off">아직 없음</b>
                <span className="mymeta">한 판이라도 치르면 명부에 오릅니다</span>
              </>
            )}
          </div>

          {failed && <p className="center-note">명부를 불러오지 못했습니다</p>}
          {!failed && !board && <p className="center-note">명부를 펼치는 중입니다</p>}

          {board && board.rows.length === 0 && (
            <p className="center-note">
              {label} 구역은 아직 첫 줄이 비어 있습니다. 먼저 이름을 올려 보세요.
            </p>
          )}

          {board && board.rows.length > 0 && (
            <>
              <div className="roster-head">
                <span>순위</span>
                <span>감별사</span>
                <span>직급</span>
              </div>
              <ol className="roster">
                {board.rows.map((r) => {
                  const lv = levelFromXp(r.xp).level;
                  return (
                    <li key={`${r.rank}-${r.name}`} className={r.me ? "me" : undefined} ref={r.me ? meRow : undefined}>
                      <span className="rk mono">{r.rank}</span>
                      <span className="who">
                        {r.name}
                        {r.me && <em>나</em>}
                      </span>
                      <span className="lv mono">
                        Lv.{lv}
                        <small>{titleFor(lv)}</small>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {/* 첫 장 밖이면 내 줄을 끝에 이어 붙인다. 순위가 한참 밑이어도
                  스크롤로 찾아 헤매지 않게 */}
              {mine && !inFirstPage && (
                <ol className="roster tail" start={mine.rank}>
                  <li className="me" ref={meRow}>
                    <span className="rk mono">{mine.rank}</span>
                    <span className="who">
                      {mine.name}
                      <em>나</em>
                    </span>
                    <span className="lv mono">
                      Lv.{levelFromXp(mine.xp).level}
                      <small>{titleFor(levelFromXp(mine.xp).level)}</small>
                    </span>
                  </li>
                </ol>
              )}
              <p className="roster-note">
                {board.total}명 중 {board.rows.length}명까지 싣습니다. 직급은 세 창구에서 쌓은 점수로 오릅니다.
              </p>
            </>
          )}

          <div className="result-actions">
            <Link className="btn btn-ghost" href="/record">
              기록 열람실
            </Link>
            <Link className="btn btn-ghost" href="/">
              창구로 돌아가기
            </Link>
          </div>
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
