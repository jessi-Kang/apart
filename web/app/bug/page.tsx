"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { GoogleMark } from "@/components/GoogleMark";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { addXp } from "@/lib/level";
import { areaPref } from "@/lib/local";
import { sfxResult, sfxTap } from "@/lib/sound";

type Sent = { ok: true; awarded: boolean; points: number; no?: string } | null;
interface Cap {
  rows: { k: string; v: number }[] | null;
  ask: string | null;
}

const WHERE = ["감별 O/X", "이름 조립", "진짜 찾기", "홈 접수 대장", "기록 열람실", "구역 명부", "그 밖"];

/**
 * 버그 제보 — 민원 접수 창구.
 *
 * 버그를 알려 주러 온 사람에게 로그인부터 하라고 하면 대부분 그냥 간다.
 * 그래서 비회원도 그냥 낼 수 있다. 다만 점수는 계정이 있어야 붙는다 —
 * 서버가 누군지 알아야 몇 번 냈는지 셀 수 있고, 그래야 어뷰징을 막는다.
 *
 * 화면은 다른 창구와 같은 서식이다. 전에는 여기만 라벨과 입력칸을 세로로
 * 늘어놓은 평범한 웹 폼이라, 서류 세계관 한가운데에 다른 사이트 한 장이
 * 끼어 있는 것처럼 보였다. 항목은 괘선 서식표에 넣고, 본인 확인도 창구에서
 * 실제로 하는 일 — 대장을 보고 칸의 값을 옮겨 적기 — 로 바꿨다.
 */
export default function BugPage() {
  const [cap, setCap] = useState<Cap>({ rows: null, ask: null });
  const [body, setBody] = useState("");
  const [where, setWhere] = useState("");
  const [answer, setAnswer] = useState("");
  const [nickname, setNickname] = useState(""); // 허니팟 — 사람은 못 본다
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Sent>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const newCaptcha = () =>
    fetch("/api/bug/captcha")
      .then((r) => r.json())
      .then((d: Cap) => setCap(d))
      .catch(() => setCap({ rows: null, ask: null }));

  useEffect(() => {
    void newCaptcha();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: { user: unknown }) => setSignedIn(Boolean(m.user)))
      .catch(() => setSignedIn(false));
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    sfxTap();
    try {
      const res = await fetch("/api/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, where: where || areaPref(), answer, nickname }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        awarded?: boolean;
        points?: number;
        no?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(
          data.error === "captcha"
            ? "대장의 숫자와 다릅니다. 다시 확인해 주세요"
            : data.error === "too_short"
              ? "조금만 더 자세히 적어 주세요"
              : "접수하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
        );
        // 확인란은 한 번 쓰면 버려지므로 새 대장을 받아 온다
        void newCaptcha();
        setAnswer("");
        return;
      }
      if (data.awarded && data.points) addXp(data.points);
      sfxResult();
      setSent({ ok: true, awarded: Boolean(data.awarded), points: data.points ?? 0, no: data.no });
    } catch {
      setError("접수하지 못했습니다. 잠시 뒤 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          겪으신 문제를
          <br />
          <em>접수</em>합니다
        </h2>
        <p className="note">어느 창구에서 무엇이 이상했는지 적어 주시면 고치는 데 큰 도움이 됩니다.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>민원 접수</small>
          </Link>
          <Link className="close-x" href="/" aria-label="창구로 돌아가기">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </header>

        <section className="screen result bug-screen">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>

          {sent ? (
            <>
              <DocTitle eyebrow="접수완료" title="민원을 접수했습니다" />
              {/* 도장은 끝난 일에만 찍는다 — 접수가 끝난 지금이 그 자리다 */}
              <StampHero name="접 수 완 료" />
              <VForm>
                {sent.no && (
                  <VRow label="접수번호">
                    <span className="mono">제 {sent.no} 호</span>
                  </VRow>
                )}
                <VRow label="처리">
                  <span>확인하고 고치겠습니다</span>
                </VRow>
                <VRow label="사례">
                  {sent.awarded ? (
                    <span className="accent">{sent.points}점</span>
                  ) : (
                    <span>
                      없음 <small>{signedIn === false ? "기록을 보관하시면 사례가 붙습니다" : "오늘 사례는 다 나갔습니다"}</small>
                    </span>
                  )}
                </VRow>
              </VForm>
              <div className="result-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSent(null);
                    setBody("");
                    setAnswer("");
                    void newCaptcha();
                  }}
                >
                  또 접수하기
                </button>
              </div>
            </>
          ) : (
            <>
              <DocTitle eyebrow="민원접수" title="버그 제보" />

              <VForm>
                <VRow label="접수 창구">
                  <select
                    id="bug-where"
                    className="bug-sel"
                    aria-label="접수 창구"
                    value={where}
                    onChange={(e) => setWhere(e.target.value)}
                  >
                    {/* "고르지 않음"은 고르지 말라는 말로 읽힌다. 기본값이
                        권유여야 눌러 본다 */}
                    <option value="">선택하기</option>
                    {WHERE.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </VRow>
                <VRow label="민원 내용">
                  <textarea
                    id="bug-body"
                    className="bug-body"
                    aria-label="민원 내용"
                    value={body}
                    maxLength={1000}
                    rows={6}
                    placeholder="무엇을 하다가 어떻게 됐는지 적어 주세요. 화면이 어떻게 보였는지도 좋습니다."
                    onChange={(e) => setBody(e.target.value)}
                  />
                </VRow>
              </VForm>

              {/* 허니팟: 사람 눈에 안 보이고 읽는 기계에도 안 잡힌다 */}
              <input
                type="text"
                name="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hp"
              />

              {cap.rows && cap.ask && (
                <div className="capbox">
                  {/* 왜 갑자기 숫자를 옮겨 적으라는지 말해 준다. 이유 없이 뜨면
                      "이건 또 뭐지" 하고 멈추게 된다 */}
                  <p className="sec-cap">
                    본인 확인<small>사람이 쓴 민원인지 확인합니다</small>
                  </p>
                  <p className="cap-q">
                    아래 단지 대장에서 <b>{cap.ask}</b> 칸의 숫자를 그대로 옮겨 적으십시오
                  </p>
                  {/* 적는 칸도 대장 안에 둔다. 표 밖에 입력칸을 따로 세우면
                      "서식을 보고 옮겨 적는다"가 아니라 "퀴즈에 답한다"가 된다 */}
                  <table className="capledger">
                    <tbody>
                      {cap.rows.map((r) => (
                        <tr key={r.k}>
                          <th scope="row">{r.k}</th>
                          <td className="mono">{r.v}</td>
                        </tr>
                      ))}
                      <tr className="cap-write">
                        <th scope="row">
                          <label htmlFor="bug-answer">{cap.ask}</label>
                        </th>
                        <td>
                          <input
                            id="bug-answer"
                            type="text"
                            inputMode="numeric"
                            value={answer}
                            maxLength={4}
                            autoComplete="off"
                            placeholder="여기에 옮겨 적으십시오"
                            onChange={(e) => setAnswer(e.target.value)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {error && <p className="bug-error">{error}</p>}

              {signedIn === false && (
                <p className="bug-note">
                  <a href="/api/auth/login" className="bug-login">
                    <GoogleMark size={13} />
                    기록 보관
                  </a>
                  을 하시면 접수에도 사례가 붙습니다. 안 하셔도 접수는 됩니다.
                </p>
              )}

              <div className="result-actions">
                <button className="btn btn-next full" onClick={submit} disabled={busy || body.trim().length < 10}>
                  {busy ? "접수하는 중" : "접수하기"}
                </button>
              </div>
            </>
          )}
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
