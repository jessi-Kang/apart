"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SYNC_EVENT, ensureSynced } from "@/lib/cloud";
import { currentLevel, type LevelInfo } from "@/lib/level";

interface Me {
  configured: boolean;
  user: { name: string } | null;
}

/**
 * 홈의 감별사 신분증 한 줄.
 * 레벨·이름·직급이 한 줄에 들어가고, 누르면 기록 열람실로 간다.
 * 로그아웃처럼 자주 쓰지 않는 계정 동작은 여기 두지 않는다 — 홈은
 * 게임을 고르는 자리고, 계정은 기록 열람실에 모여 있다.
 */
export function IdBadge() {
  const [info, setInfo] = useState<LevelInfo | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const refresh = () => setInfo(currentLevel());
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: Me) => {
        setMe(m);
        if (m.user) void ensureSynced();
      })
      .catch(() => setMe({ configured: false, user: null }));
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, []);

  const title = info?.title ?? "견습 감별사";
  const guest = me?.configured && !me.user;

  return (
    <div className="idbadge">
      <Link className="idb-main" href="/record">
        <span className="idb-lv mono">Lv.{info?.level ?? 1}</span>
        <b className="idb-name">{me?.user ? me.user.name : title}</b>
        {me?.user && <span className="idb-title">{title}</span>}
        <span className="idb-go">기록 열람</span>
      </Link>
      {guest && (
        <a className="idb-auth" href="/api/auth/login">
          기록 보관
        </a>
      )}
    </div>
  );
}
