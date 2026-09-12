"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocTitle } from "@/components/VerdictForm";
import { GoogleMark } from "@/components/GoogleMark";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { areaPref } from "@/lib/local";
import { areaXp, levelFromXp, playedAreas, titleFor } from "@/lib/level";
import { rankShareText, shareLink } from "@/lib/sharecard";
import { sfxTap } from "@/lib/sound";

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
  locked: boolean;
  minPlayers: number;
  signedIn: boolean;
}

const shortArea = (a: string) => a.replace(/특별자치시$|특별자치도$|특별시$|광역시$/, "") || "전국";

/**
 * 구역 명부: 그 구역에서 친 기록이 있는 사람들의 순위.
 *
 * 구역은 사람에게 딸린 값이 아니라 그때그때 고르는 출제 범위다. 그래서
 * 내가 친 구역이 여럿이면 그 구역 명부를 모두 볼 수 있어야 한다 — 위쪽
 * 칸에 내가 기록을 가진 구역을 늘어놓고 눌러서 옮겨 다닌다.
 *
 * 남이 몇 점인지보다 "내가 어디쯤인가"가 먼저다. 그래서 내 줄은 두 번 나온다 —
 * 위쪽 요약에 한 번, 명부 안 제자리에 한 번. 첫 장(50명) 밖이면 아래에 따로
 * 붙여서, 순위가 한참 밑이어도 스크롤 없이 보인다.
 */
export default function RankingPage() {
  const [areas, setAreas] = useState<string[] | null>(null);
  const [area, setArea] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [localXp, setLocalXp] = useState(0);
  const [shared, setShared] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  const meRow = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // 기록이 있는 구역 + 지금 고른 구역을 함께 늘어놓는다.
    // 아직 한 판도 안 친 구역이라도 지금 맡은 곳이면 명부를 볼 수 있어야 한다
    const played = playedAreas();
    const now = areaPref();
    const list = [...new Set([now, ...played])];
    setAreas(list);
    setArea(now);
  }, []);

  useEffect(() => {
    if (areas === null) return;
    setBoard(null);
    setFailed(false);
    setLocalXp(areaXp(area));
    setShared("idle");
    fetch(`/api/ranking${area ? `?area=${encodeURIComponent(area)}` : ""}`)
      .then((r) => r.json())
      .then((b: Board) => setBoard(b))
      .catch(() => setFailed(true));
  }, [area, areas]);

  const jumpToMe = useCallback(() => {
    meRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const label = shortArea(area);
  const mine = board?.mine ?? null;
  const inFirstPage = Boolean(mine && board?.rows.some((r) => r.me));
  const lv = (xp: number) => levelFromXp(xp).level;

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          같은 구역
          <br />
          감별사 <em>명부</em>입니다
        </h2>
        <p className="note">
          그 구역에서 친 기록이 있으면 이름이 오릅니다. 이름은 일부만 보이고,
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

          {/* 내가 친 구역이 여럿이면 골라서 옮겨 다닌다 */}
          {areas && areas.length > 1 && (
            <div className="area-tabs" role="tablist" aria-label="구역 고르기">
              {areas.map((a) => (
                <button
                  key={a || "전국"}
                  type="button"
                  role="tab"
                  aria-selected={a === area}
                  className={`area-tab ${a === area ? "on" : ""}`}
                  onClick={() => setArea(a)}
                >
                  {shortArea(a)}
                </button>
              ))}
            </div>
          )}

          {/* 내 자리를 맨 위에 한 번 더 박아 둔다 — 명부를 여는 이유가 이것이다 */}
          <div className="mycard">
            {mine && board!.locked ? (
              /* 명부가 잠겨 있으면 순위를 말하지 않는다. "4명 중 2위"도 순위다 —
                 몇 명이 나보다 아래인지 알려 주는 셈이라 숨기기로 한 것에 어긋난다 */
              <>
                <span className="myk">내 기록</span>
                <b className="myrank mono">
                  {mine.xp}
                  <i>점</i>
                </b>
                <span className="mymeta">
                  Lv.{lv(mine.xp)} {titleFor(lv(mine.xp))} · {label}
                </span>
              </>
            ) : mine ? (
              <>
                <span className="myk">내 순위</span>
                <b className="myrank mono">
                  {mine.rank}
                  <i>위</i>
                </b>
                <span className="mymeta">
                  {board!.total}명 중 · Lv.{lv(mine.xp)} {titleFor(lv(mine.xp))}
                </span>
                {!inFirstPage && (
                  <button type="button" className="myjump" onClick={jumpToMe}>
                    내 줄 보기
                  </button>
                )}
              </>
            ) : board && !board.signedIn ? (
              <>
                <span className="myk">내 기록</span>
                <b className="myrank mono">
                  {localXp}
                  <i>점</i>
                </b>
                <span className="mymeta">이 기기에만 있습니다. 보관하면 명부에 오릅니다</span>
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
                <span className="mymeta">{label}에서 한 판이라도 치르면 이름이 오릅니다</span>
              </>
            )}
          </div>

          {/* 순위는 자랑이 되는 자리다. 남들 사이에서 내가 어디쯤인지가
              그림 없이도 한 줄로 전해진다 */}
          {mine && board && !board.locked && (
            <button
              type="button"
              className="share-link"
              onClick={async () => {
                sfxTap();
                setShared(
                  await shareLink(
                    rankShareText(label === "전국" ? "" : label, mine.rank, board.total, titleFor(lv(mine.xp))),
                  ),
                );
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M5.6 8.4a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.7.7M8.4 5.6a2.6 2.6 0 0 0-3.7 0L2.6 7.7a2.6 2.6 0 0 0 3.7 3.7l.7-.7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {shared === "shared" ? "공유 완료" : shared === "copied" ? "링크 복사됨" : shared === "failed" ? "복사 실패" : "내 순위 공유"}
            </button>
          )}

          {failed && <p className="center-note">명부를 불러오지 못했습니다</p>}
          {!failed && !board && <p className="center-note">명부를 펼치는 중입니다</p>}

          {/* 사람이 적을 때는 명부를 열지 않는다. 셋뿐인 순위표는 순위가 아니라 명단이다 */}
          {board?.locked && (
            <div className="locked">
              <b>아직 명부를 펼치지 않았습니다</b>
              <p>
                {label} 구역에서 지금까지 {board.total}명이 기록을 남겼습니다. {board.minPlayers}명이
                모이면 순위가 열립니다.
              </p>
            </div>
          )}

          {board && !board.locked && board.rows.length > 0 && (
            <>
              <div className="roster-head">
                <span>순위</span>
                <span>감별사</span>
                <span>직급</span>
              </div>
              <ol className="roster">
                {board.rows.map((r) => (
                  <li key={`${r.rank}-${r.name}`} className={r.me ? "me" : undefined} ref={r.me ? meRow : undefined}>
                    <span className="rk mono">{r.rank}</span>
                    <span className="who">
                      {r.name}
                      {r.me && <em>나</em>}
                    </span>
                    <span className="lv mono">
                      Lv.{lv(r.xp)}
                      <small>{titleFor(lv(r.xp))}</small>
                    </span>
                  </li>
                ))}
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
                      Lv.{lv(mine.xp)}
                      <small>{titleFor(lv(mine.xp))}</small>
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
