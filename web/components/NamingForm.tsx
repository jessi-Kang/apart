"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocTitle, StampHero, VForm, VRow } from "@/components/VerdictForm";
import { Seal } from "@/components/Seal";
import { SheetFooter } from "@/components/SheetFooter";
import { SoundToggle } from "@/components/SoundToggle";
import { addXp } from "@/lib/level";
import { areaPref, setAreaPref } from "@/lib/local";
import { sfxPiece, sfxResult, sfxStampRight, sfxStampWrong, sfxTap } from "@/lib/sound";
import type { PieceGroup } from "@/lib/naming";
import { AWARD_PER_DAY, COIN_POINTS } from "@/lib/coinrule";

interface Region {
  sido: string;
  label: string;
}
type Verdict =
  | { ok: true }
  | { ok: false; reason: "exists"; near: string }
  | { ok: false; reason: "format"; message: string };
type Done = { no?: string; awarded: boolean; points: number; name: string } | null;

/**
 * 작명소.
 *
 * 감별 창구 셋은 우리가 낸 이름을 사람이 가려내는 곳이고, 여기는 반대다.
 * 그래서 첫 화면이 "왜 이걸 하는가"부터 말한다 — 지은 이름이 감별 창구에
 * 올라가고, 남이 속을수록 내 것이 잘 지은 이름이라는 뜻이 된다.
 *
 * 지역을 먼저 고르게 하는 이유: 아파트 이름의 절반은 동네 이름이고, 그
 * 동네가 어디인지에 따라 같은 이름도 그럴싸함이 갈린다. 고른 구역의 실제
 * 동 이름을 조각으로 준다.
 *
 * 판정(실존 대조)은 서버에서만 한다. 실단지 목록을 내려주면 그것으로 감별
 * 창구의 답을 맞출 수 있다 — 작명소가 정답지를 흘리는 문이 되면 안 된다.
 */
export function NamingForm({ regions }: { regions: Region[] }) {
  const [phase, setPhase] = useState<"intro" | "make" | "done">("intro");
  const [area, setArea] = useState("");
  const [groups, setGroups] = useState<PieceGroup[]>([]);
  const [name, setName] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const [done, setDone] = useState<Done>(null);
  // 조각을 다 풀어놓으면 화면이 목록이 되고, 무엇을 눌러야 할지 고르기가 더 어렵다.
  // 묶음마다 몇 개만 뽑아 보여주고 다시 뽑게 한다 — 고르는 일이 훨씬 가볍고,
  // 다시 뽑을 때마다 안 보던 조각이 나와서 계속 새 이름이 나온다
  const [shuffle, setShuffle] = useState(0);

  // 구역은 서버가 넘겨준다. 지난번에 고른 구역이 있으면 그대로 쓴다
  useEffect(() => {
    const pref = areaPref();
    if (pref && regions.some((r) => r.sido === pref)) setArea(pref);
  }, [regions]);

  // 구역을 고르면 그 구역의 조각을 받아 온다
  useEffect(() => {
    // 구역을 도로 비우면 조각도 치운다. 일찍 돌아가면 앞서 받은 조각이 남아,
    // 고르지도 않은 구역의 동네 이름이 계속 떠 있는다
    setGroups([]);
    if (!area) return;
    fetch(`/api/naming?area=${encodeURIComponent(area)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: { groups: PieceGroup[] }) => setGroups(d.groups))
      .catch(() => setGroups([]));
  }, [area]);

  /** 묶음마다 보여줄 수. 동네만 조금 넉넉하게 — 이름의 첫 칸이라 고를 맛이 있어야 한다 */
  const SHOW: Record<string, number> = { place: 10, brand: 6, maker: 5, place2: 5, grade: 5, korean: 5 };

  /** 씨앗이 같으면 같은 표본이 나온다 — 다시 그릴 때마다 조각이 흔들리면 못 누른다 */
  const sample = (items: string[], n: number, salt: number) => {
    if (items.length <= n) return items;
    const out: string[] = [];
    const used = new Set<number>();
    let x = (salt * 9301 + 49297) % 233280 || 1;
    while (out.length < n) {
      x = (x * 9301 + 49297) % 233280;
      const i = x % items.length;
      if (used.has(i)) {
        x += 1;
        continue;
      }
      used.add(i);
      out.push(items[i]);
    }
    return out;
  };

  const add = (piece: string) => {
    // 조각이 쌓일수록 음이 올라간다. 같은 소리가 반복되면 조립하는 맛이 없다
    sfxPiece(name ? name.split(" ").length : 0);
    setVerdict(null);
    setName((prev) => (prev ? `${prev} ${piece}` : piece).slice(0, 20));
  };

  async function submit() {
    if (busy || !name.trim() || !area) return;
    setBusy(true);
    setFailed("");
    try {
      const res = await fetch("/api/naming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, area }),
      });
      if (!res.ok) {
        setFailed(res.status === 503 ? "접수하지 못했습니다. 잠시 뒤 다시 시도해 주세요" : "확인하지 못했습니다");
        return;
      }
      const data = (await res.json()) as { verdict: Verdict; no?: string; awarded?: boolean; points?: number };
      setVerdict(data.verdict);
      if (!data.verdict.ok) {
        sfxStampWrong();
        return;
      }
      if (data.awarded && data.points) addXp(data.points);
      sfxStampRight();
      sfxResult();
      setDone({ no: data.no, awarded: Boolean(data.awarded), points: data.points ?? 0, name });
      setPhase("done");
    } catch {
      setFailed("확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="frame">
      <aside className="rail">
        <h2>
          이번엔 당신이
          <br />
          이름을 <em>짓습니다</em>
        </h2>
        <p className="note">지은 이름은 감별 창구에 올라갑니다. 남이 못 가려낼수록 잘 지은 이름입니다.</p>
      </aside>

      <main className="sheet">
        <header className="sheet-header">
          <Link className="brand" href="/">
            아파트 감별사<small>작명소</small>
          </Link>
          {/* 작명소도 창구다. 배경음과 그 스위치가 다른 창구와 같아야 한다 —
              여기만 조용하면 같은 건물 안에서 방을 옮긴 느낌이 안 난다 */}
          <span className="head-tools">
            <SoundToggle />
            <Link className="close-x" href="/" aria-label="창구로 돌아가기">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </Link>
          </span>
        </header>

        <section className="screen result">
          <div className="result-seal" aria-hidden="true">
            <Seal size={216} />
          </div>

          {phase === "intro" && (
            <>
              <DocTitle eyebrow="작명접수" title="가짜 단지명 짓기" />
              {/* 무엇을 얻는지를 먼저 말한다. 규칙 설명부터 하면 읽다가 나간다 */}
              <p className="coin-lead">
                지금까지는 <b>가려내는 쪽</b>이었습니다. 여기서는 <b>속이는 쪽</b>입니다.
              </p>
              <VForm>
                <VRow label="하는 일">
                  있을 법한데 실제로는 없는 단지명을 짓습니다
                </VRow>
                {/* 무엇을 얻는지를 앞에 둔다. 절차만 늘어놓으면 왜 하는지 모른 채 닫는다 */}
                <VRow label="얻는 것">
                  <span>
                    <b className="accent">{COIN_POINTS}점</b>, 그리고 내 이름이 감별 창구에 걸립니다
                    <small>하루 {AWARD_PER_DAY}건까지 점수가 붙습니다</small>
                  </span>
                </VRow>
                <VRow label="자랑">
                  <span>
                    <b>몇 명이 속았는지</b> 이름마다 세어 알려 드립니다
                    <small>많이 속인 이름을 지은 사람에게는 따로 호칭이 붙습니다</small>
                  </span>
                </VRow>
                <VRow label="확인">
                  <span>
                    접수 즉시 실단지 <b className="accent">12,121건</b>과 대조합니다
                    <small>진짜로 있는 이름이면 그 이름을 짚어 드립니다</small>
                  </span>
                </VRow>
              </VForm>
              <div className="result-actions">
                <button className="btn btn-next" onClick={() => { sfxTap(); setPhase("make"); }}>
                  이름 지으러 가기
                </button>
              </div>
            </>
          )}

          {phase === "make" && (
            <>
              <DocTitle eyebrow="작명접수" title="이름 짓기" />
              <p className="task-line">
                <b>구역</b>을 고르고 조각을 눌러 짓습니다. 직접 적어도 됩니다.
              </p>

              <VForm>
                <VRow label="구역">
                  <select
                    className="bug-sel"
                    aria-label="구역"
                    value={area}
                    onChange={(e) => {
                      setArea(e.target.value);
                      setAreaPref(e.target.value);
                      setVerdict(null);
                    }}
                  >
                    <option value="">선택하기</option>
                    {regions.map((r) => (
                      <option key={r.sido} value={r.sido}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </VRow>
                <VRow label="지은 이름">
                  <input
                    key={name.split(" ").length}
                    className="coin-input paper-in"
                    aria-label="지은 이름"
                    value={name}
                    maxLength={20}
                    placeholder="조각을 누르거나 직접 적기"
                    onChange={(e) => {
                      setName(e.target.value);
                      setVerdict(null);
                    }}
                  />
                </VRow>
              </VForm>

              <div className="coin-bar">
                <button className="btn-mini" onClick={() => { sfxTap(); setName(""); setVerdict(null); }} disabled={!name}>
                  비우기
                </button>
                <button
                  className="btn-mini"
                  onClick={() => { sfxTap(); setName((p) => p.replace(/\s*\S+$/, "")); setVerdict(null); }}
                  disabled={!name}
                >
                  한 조각 지우기
                </button>
                <span className="coin-len mono">{name.length}/20</span>
              </div>

              {verdict && !verdict.ok && (
                <p className="coin-no">
                  {verdict.reason === "exists" ? (
                    <>
                      <b>이미 있는 이름입니다</b> — {verdict.near}. 조금 바꿔 주세요.
                    </>
                  ) : (
                    <b>{verdict.message}</b>
                  )}
                </p>
              )}
              {failed && <p className="bug-error">{failed}</p>}

              {/* 단추는 하나다. 접수하기가 어차피 실단지와 대조하므로 "있는지 확인"을
                  따로 두면 무엇이 다른지 생각하게 만들 뿐이다. 실존하는 이름이면
                  저장하지 않고 그 이름을 짚어 준다 */}
              <div className="result-actions">
                <button className="btn btn-next full" onClick={() => void submit()} disabled={busy || !name || !area}>
                  {busy ? "대조 중" : "대조하고 접수하기"}
                </button>
              </div>

              {!area && <p className="center-note">구역을 먼저 고르면 그 동네 이름이 조각으로 나옵니다</p>}
              {area && groups.length === 0 && <p className="center-note">조각을 가져오는 중입니다</p>}
              {groups.length > 0 && (
                <div className="coin-head">
                  <span>조각</span>
                  <button className="btn-mini" onClick={() => { sfxTap(); setShuffle((n) => n + 1); }}>
                    다른 조각 보기
                  </button>
                </div>
              )}
              {groups.map((g, gi) => (
                <div className="coin-group" key={g.key}>
                  <p className="coin-gk">
                    {g.label}
                    <small>{g.hint}</small>
                  </p>
                  <div className="coin-pieces">
                    {sample(g.items, SHOW[g.key] ?? 6, shuffle * 31 + gi + 1).map((it) => (
                      <button key={it} className="tile" onClick={() => add(it)}>
                        {it}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            </>
          )}

          {phase === "done" && done && (
            <>
              <DocTitle eyebrow="접수완료" title="작명을 접수했습니다" />
              {/* 도장은 끝난 일에만 찍는다 */}
              <StampHero name="접 수 완 료" />
              <VForm>
                <VRow label="지은 이름">
                  <b>{done.name}</b>
                </VRow>
                {done.no && (
                  <VRow label="접수번호">
                    <span className="mono">제 {done.no} 호</span>
                  </VRow>
                )}
                <VRow label="사례">
                  {done.awarded ? (
                    <span className="accent">{done.points}점</span>
                  ) : (
                    <span>
                      없음 <small>오늘 사례는 다 나갔거나 기록을 보관하지 않으셨습니다</small>
                    </span>
                  )}
                </VRow>
                <VRow label="다음">
                  <span>
                    검토 후 감별 창구에 올립니다
                    <small>사람들이 얼마나 속았는지는 나중에 알려 드립니다</small>
                  </span>
                </VRow>
              </VForm>
              <div className="result-actions">
                <button
                  className="btn btn-next"
                  onClick={() => {
                    setName("");
                    setVerdict(null);
                    setDone(null);
                    setPhase("make");
                  }}
                >
                  또 짓기
                </button>
                <Link className="btn btn-ghost" href="/">
                  창구로 돌아가기
                </Link>
              </div>
            </>
          )}
        </section>

        <SheetFooter />
      </main>
    </div>
  );
}
