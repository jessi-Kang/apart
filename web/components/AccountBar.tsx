"use client";

import { useEffect, useState } from "react";
import { ensureSynced } from "@/lib/cloud";

interface Me {
  configured: boolean;
  user: { name: string } | null;
}

/**
 * 홈의 접수인 등록 상태 줄.
 * - 비회원: 기록이 이 기기에만 남는다는 안내 + 구글 로그인 버튼
 * - 로그인: 이름 + 동기화 상태 + 로그아웃
 * - 로그인 기능이 꺼진 배포(env 미설정)에서는 아무것도 그리지 않는다
 */
export function AccountBar() {
  const [me, setMe] = useState<Me | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (m: Me) => {
        setMe(m);
        if (m.user) {
          await ensureSynced();
          setSynced(true);
        }
      })
      .catch(() => setMe({ configured: false, user: null }));
  }, []);

  if (!me?.configured) return null;

  if (!me.user) {
    return (
      <div className="account-line">
        <span>
          <strong>비회원 접수 중</strong> — 기록은 이 기기에만 남습니다
        </span>
        <a className="account-btn" href="/api/auth/login">
          Google로 기록 보관
        </a>
      </div>
    );
  }

  return (
    <div className="account-line">
      <span>
        <strong>{me.user.name}</strong> 감별사 · {synced ? "기록 동기화 완료" : "기록 동기화 중…"}
      </span>
      <button
        type="button"
        className="account-btn account-btn-ghost"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          location.reload();
        }}
      >
        로그아웃
      </button>
    </div>
  );
}
