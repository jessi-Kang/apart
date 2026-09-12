"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SYNC_EVENT, ensureSynced } from "@/lib/cloud";
import { GoogleMark } from "./GoogleMark";
import type { RegionGroup } from "@/lib/data";
import { currentLevel, type LevelInfo } from "@/lib/level";
import { AREA_EVENT, areaPref, setAreaPref } from "@/lib/local";
import { playedAreas } from "@/lib/level";

interface Me {
  configured: boolean;
  user: { name: string } | null;
}

/**
 * 홈의 감별사 신분증.
 * 윗줄은 레벨·이름·직급, 아랫줄은 담당 구역. 둘 다 "지금 나는 누구고 어디를
 * 맡고 있나"라서 한 칸에 묶는다 — 따로 두면 서식 칸만 늘어난다.
 *
 * 담당 구역을 고르면 세 창구와 공식전이 모두 그 범위를 따른다.
 * 고른 값은 칸 안의 글자가 이미 말해 주므로 아래에 따로 설명을 달지 않는다.
 *
 * 로그아웃처럼 자주 쓰지 않는 계정 동작은 여기 두지 않는다 — 홈은
 * 게임을 고르는 자리고, 계정은 기록 열람실에 모여 있다.
 */
export function IdBadge({ regions }: { regions: RegionGroup[] }) {
  const [info, setInfo] = useState<LevelInfo | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [area, setArea] = useState("");
  // 명부가 열린 구역. 하나도 없으면 입구 자체를 안 만든다 —
  // 잠긴 명부로 가는 링크는 눌러 보고 나서야 볼 게 없다는 걸 알려 준다
  const [openArea, setOpenArea] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setInfo(currentLevel());
    const refreshArea = () => setArea(areaPref());
    refresh();
    refreshArea();
    window.addEventListener(SYNC_EVENT, refresh);
    window.addEventListener(AREA_EVENT, refreshArea);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: Me) => {
        setMe(m);
        if (m.user) void ensureSynced();
      })
      .catch(() => setMe({ configured: false, user: null }));
    return () => {
      window.removeEventListener(SYNC_EVENT, refresh);
      window.removeEventListener(AREA_EVENT, refreshArea);
    };
  }, []);

  useEffect(() => {
    // 지금 맡은 구역과 여태 친 구역을 함께 물어본다. 그중 하나라도 열려 있으면
    // 그 구역 명부로 데려간다
    const mine = [...new Set([areaPref(), ...playedAreas()])];
    fetch(`/api/ranking/open?areas=${encodeURIComponent(mine.join(","))}`)
      .then((r) => r.json())
      .then((d: { open: string[] }) => setOpenArea(d.open?.[0] ?? null))
      .catch(() => setOpenArea(null));
  }, [area]);

  const title = info?.title ?? "견습 감별사";
  const guest = me?.configured && !me.user;

  return (
    <div className="idbadge">
      <div className="idb-row">
        <Link className="idb-main" href="/record">
          <span className="idb-lv mono">Lv.{info?.level ?? 1}</span>
          <b className="idb-name">{me?.user ? me.user.name : title}</b>
          {me?.user && <span className="idb-title">{title}</span>}
          <span className="idb-go">기록 열람</span>
        </Link>
        {guest && (
          <a className="idb-auth" href="/api/auth/login">
            <GoogleMark size={13} />
            기록 보관
          </a>
        )}
      </div>
      <div className="idb-row idb-area">
        <label className="area-k" htmlFor="area-select">
          담당 구역
        </label>
        <select
          id="area-select"
          className="area-sel"
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setAreaPref(e.target.value);
          }}
        >
          <option value="">전국 · 무작위</option>
          {regions.map((r) => (
            <option key={r.sido} value={r.sido}>
              {r.label}
            </option>
          ))}
        </select>
        {openArea !== null && (
          <Link className="area-rank" href="/ranking">
            명부
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
              <path d="M2.6 1.2L6 4.5 2.6 7.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
