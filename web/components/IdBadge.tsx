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
 * 레벨 칩과 계정 줄이 따로 놀던 것을 하나로 묶었다 — 둘 다 "나는 누구인가"를
 * 말하는 정보라 서류에서도 같은 칸에 들어간다. 누르면 기록 열람실로 간다.
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

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    location.reload();
  };

  return (
    <div className="idbadge">
      <Link className="idb-main" href="/record">
        <span className="idb-lv mono">Lv.{info?.level ?? 1}</span>
        <span className="idb-name">
          {me?.user ? me.user.name : (info?.title ?? "견습 감별사")}
          {me?.user && info && <small>{info.title}</small>}
        </span>
        <span className="idb-go">기록 열람</span>
      </Link>
      {me?.configured && (
        <span className="idb-auth">
          {me.user ? (
            <button type="button" onClick={() => void logout()}>
              로그아웃
            </button>
          ) : (
            <a href="/api/auth/login">Google로 기록 보관</a>
          )}
        </span>
      )}
    </div>
  );
}
