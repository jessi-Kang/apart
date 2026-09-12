"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle } from "@/components/VerdictForm";
import { GoogleMark } from "@/components/GoogleMark";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { addXp } from "@/lib/level";
import { areaPref } from "@/lib/local";
import { sfxResult, sfxTap } from "@/lib/sound";

type Sent = { ok: true; awarded: boolean; points: number } | null;

const WHERE = ["감별 O/X", "이름 조립", "진짜 찾기", "홈 접수 대장", "기록 열람실", "구역 명부", "그 밖"];

/**
 * 버그 제보.
 *
 * 버그를 알려 주러 온 사람에게 로그인부터 하라고 하면 대부분 그냥 간다.
 * 그래서 비회원도 그냥 낼 수 있다. 다만 점수는 계정이 있어야 붙는다 —
 * 서버가 누군지 알아야 몇 번 냈는지 셀 수 있고, 그래야 어뷰징을 막는다.
 *
 * 캡챠는 한 자리 덧셈이다. 그림을 비틀어 놓는 방식은 눈이 불편한 사람에게
 * 읽을 방법이 없는 관문이 된다.
 */
export default function BugPage() {
  const [question, setQuestion] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [where, setWhere] = useState("");
  const [answer, setAnswer] = useState("");
  const [nickname, setNickname] = useState(""); // 허니팟 — 사람은 못 본다
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Sent>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/bug/captcha")
      .then((r) => r.json())
      .then((d: { question: string | null }) => setQuestion(d.question))
      .catch(() => setQuestion(null));
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
      const data = (await res.json()) as { ok?: boolean; awarded?: boolean; points?: number; error?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.error === "captcha"
            ? "덧셈 답이 맞지 않습니다"
            : data.error === "too_short"
              ? "조금만 더 자세히 적어 주세요"
              : "보내지 못했습니다. 잠시 뒤 다시 시도해 주세요",
        );
        // 캡챠는 한 번 쓰면 버려지므로 새 문제를 받아 온다
        fetch("/api/bug/captcha")
          .then((r) => r.json())
          .then((d: { question: string | null }) => setQuestion(d.question))
          .catch(() => undefined);
        setAnswer("");
        return;
      }
      if (data.awarded && data.points) addXp(data.points);
      sfxResult();
      setSent({ ok: true, awarded: Boolean(data.awarded), points: data.points ?? 0 });
    } catch {
      setError("보내지 못했습니다. 잠시 뒤 다시 시도해 주세요");
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
          <em>알려</em> 주세요
        </h2>
        <p className="note">
          어느 화면에서 무엇이 이상했는지 적어 주시면 고치는 데 큰 도움이 됩니다.
        </p>
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

        <section className="screen result">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>

          {sent ? (
            <>
              <DocTitle eyebrow="접수완료" title="제보를 접수했습니다" />
              <p className="stamp-sub">
                {sent.awarded
                  ? `알려 주셔서 고맙습니다. ${sent.points}점을 드렸습니다.`
                  : "알려 주셔서 고맙습니다. 확인하고 고치겠습니다."}
              </p>
              {!sent.awarded && signedIn === false && (
                <p className="bug-note">
                  기록을 계정에 보관하시면 제보에도 점수가 붙습니다.
                </p>
              )}
              <div className="result-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSent(null);
                    setBody("");
                    setAnswer("");
                    fetch("/api/bug/captcha")
                      .then((r) => r.json())
                      .then((d: { question: string | null }) => setQuestion(d.question))
                      .catch(() => undefined);
                  }}
                >
                  또 제보하기
                </button>
              </div>
            </>
          ) : (
            <>
              <DocTitle eyebrow="민원접수" title="버그 제보" />

              <label className="bug-k" htmlFor="bug-where">
                어느 화면인가요
              </label>
              <select id="bug-where" className="bug-sel" value={where} onChange={(e) => setWhere(e.target.value)}>
                <option value="">고르지 않음</option>
                {WHERE.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>

              <label className="bug-k" htmlFor="bug-body">
                무엇이 이상했나요
              </label>
              <textarea
                id="bug-body"
                className="bug-body"
                value={body}
                maxLength={1000}
                rows={6}
                placeholder="무엇을 하다가 어떻게 됐는지 적어 주세요. 화면이 어떻게 보였는지도 좋습니다."
                onChange={(e) => setBody(e.target.value)}
              />

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

              {question && (
                <>
                  <label className="bug-k" htmlFor="bug-answer">
                    사람인지 확인합니다 · {question}
                  </label>
                  <input
                    id="bug-answer"
                    className="bug-answer"
                    type="text"
                    inputMode="numeric"
                    value={answer}
                    maxLength={3}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </>
              )}

              {error && <p className="bug-error">{error}</p>}

              {signedIn === false && (
                <p className="bug-note">
                  <a href="/api/auth/login" className="bug-login">
                    <GoogleMark size={13} />
                    기록 보관
                  </a>
                  을 하시면 제보에도 점수가 붙습니다. 안 하셔도 제보는 보내집니다.
                </p>
              )}

              <div className="result-actions">
                <button className="btn btn-next full" onClick={submit} disabled={busy || body.trim().length < 10}>
                  {busy ? "보내는 중" : "제보 보내기"}
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
