"use client";

import { useEffect, useState } from "react";
import { ensureSynced } from "@/lib/cloud";

interface Me {
  configured: boolean;
  user: { name: string } | null;
}

/**
 * 홈의 계정 상태 한 줄. 박스·버튼 없이 조용하게:
 * 비회원은 기록 범위와 로그인 링크, 로그인 후엔 이름과 로그아웃만.
 * 로그인 기능이 꺼진 배포(env 미설정)에서는 아무것도 그리지 않는다.
 */
export function AccountBar() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((m: Me) => {
        setMe(m);
        if (m.user) void ensureSynced();
      })
      .catch(() => setMe({ configured: false, user: null }));
  }, []);

  if (!me?.configured) return null;

  if (!me.user) {
    return (
      <p className="account-line">
        기록은 이 기기에만 저장 중 · <a href="/api/auth/login">Google로 보관</a>
      </p>
    );
  }

  return (
    <p className="account-line">
      <b>{me.user.name}</b> · 기록 보관 중 ·{" "}
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          location.reload();
        }}
      >
        로그아웃
      </button>
    </p>
  );
}
