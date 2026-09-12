"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SYNC_EVENT, ensureSynced } from "@/lib/cloud";
import { GoogleMark } from "./GoogleMark";
import type { RegionGroup } from "@/lib/data";
import { currentLevel, type LevelInfo } from "@/lib/level";
import { AREA_EVENT, areaPref, setAreaPref } from "@/lib/local";

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
      </div>
    </div>
  );
}
